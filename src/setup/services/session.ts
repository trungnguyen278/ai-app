// SPDX-License-Identifier: MIT
// The app's side of a set-up session (platform/protocols/setup/README.md): the hellos in the
// clear, SPAKE2+ with the device's code, then the requests, encrypted, one at a time. Every
// message the device sends is checked (SEC-14), and anything that breaks set-up ends the session.
import { base64url, checkedBase64url, type Random } from '@/src/shared/bytes';
import type { SetupSettings } from '@/src/shared/config';
import { ProtocolError, type Setup } from '@/src/shared/protocols';

import { Channel, context, SealError, sessionKeys, TAG_BYTES } from '../domain/channel';
import { DeviceRefused, NotConfirmed, SessionLost, type LossReason } from '../domain/errors';
import { FragmentError, Joiner, split } from '../domain/fragments';
import { decodeMessage, encodeMessage } from '../domain/messages';
import { CODE_DIGITS, major, MAX_MESSAGE, MIN_FRAGMENT, PROTOCOL } from '../domain/protocol';
import { ExchangeError, Prover, randomScalar, stretch } from '../domain/spake2plus';
import type { Link } from '../ports/link';

export interface SessionOptions {
  /** The source of the app's random scalar: the phone's (`cryptoRandom`). */
  random: Random;
  settings: SetupSettings;
}

/** What a device says of itself, and of its network, in `info`. */
export type DeviceInfo = Pick<Setup.Info, 'device' | 'bound' | 'network'>;
/** A network the device sees. */
export type Network = Setup.Network;
/** The network the device is on. */
export type NetworkStatus = Setup.NetworkStatus;
/** The network to join: by its name, or by its name's bytes when they are not UTF-8. */
export type JoinRequest = ({ ssid: string } | { ssid_hex: string }) & {
  password?: string;
  hidden?: boolean;
  security?: 'open' | 'wpa2' | 'wpa3';
};
/** The languages and the time zone that the device keeps. */
export interface Configured {
  languages: string[];
  time_zone: string;
}

/** A message of the app's, before it has its number. */
interface Outgoing {
  type: string;
  fields?: Record<string, unknown>;
  /** The channel that encrypts what follows this message. */
  then?: Channel;
}

/** A message of the device's, and its bytes, as they came, before any decryption. */
interface Answer {
  message: Setup.Message;
  bytes: Uint8Array;
  /** The app's messages that it answers, as their bytes before any encryption. */
  sent: Uint8Array[];
}

const encoder = new TextEncoder();
const CODE = new RegExp(`^[0-9]{${CODE_DIGITS}}$`);

/** One session's messages over a link: their numbers, their encryption, and their order.
 * Exported for its tests; the module's index does not export it. */
export class Conversation {
  private readonly joiner = new Joiner();
  private unlisten: (() => void) | null = null;
  /** The app's last `seq`, and the device's. */
  private sent = 0;
  private received = 0;
  /** What each of the app's messages was, by its `seq`. */
  private readonly types = new Map<number, string>();
  /** The `seq` of the app's confirmation, once it is sent. */
  private confirmation: number | null = null;
  private channel: Channel | null = null;
  private waiter: { resolve(bytes: Uint8Array): void; reject(error: SessionLost): void } | null =
    null;
  private operation = '';
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lost: LossReason | null = null;
  /** The link's closing, once the session has ended. */
  private closing: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly link: Link,
    private readonly settings: SetupSettings,
  ) {
    if (!Number.isInteger(link.fragmentSize) || link.fragmentSize < MIN_FRAGMENT) {
      throw new RangeError(`a link writes at least ${MIN_FRAGMENT} bytes at once`);
    }
    const unlisten = link.listen({
      fragment: (value) => this.take(value),
      closed: () => void this.end('ended'),
    });
    // A link that had ended has called `closed` already.
    if (this.closing === null) {
      this.unlisten = unlisten;
    } else {
      unlisten();
    }
  }

  /** Sends `messages`, in order, then gives the device's answer to the last of them, which must
   * be of type `answer`. One exchange at a time: the next waits for this one. */
  ask(operation: string, messages: Outgoing[], answer: string): Promise<Answer> {
    const asked = this.queue.then(() => this.run(operation, messages, answer));
    this.queue = asked.catch(() => undefined);
    return asked;
  }

  /** Ends the session, if it is not over yet: settles once the link is closed. */
  close(): Promise<void> {
    return this.end('ended');
  }

  private async run(operation: string, messages: Outgoing[], answer: string): Promise<Answer> {
    if (this.lost !== null) {
      throw new SessionLost(operation, this.lost);
    }
    let encrypted = this.channel !== null;
    const plaintexts = messages.map((outgoing, index) => {
      const bytes = this.compose(outgoing, this.sent + 1 + index, encrypted);
      encrypted ||= outgoing.then !== undefined;
      return bytes;
    });
    const numbers = plaintexts.map((_, index) => this.sent + 1 + index);
    this.sent += messages.length;
    messages.forEach((outgoing, index) => this.types.set(numbers[index], outgoing.type));
    this.operation = operation;
    const arrived = new Promise<Uint8Array>((resolve, reject) => {
      this.waiter = { resolve, reject };
    });
    // A loss rejects it while the app writes, before anything awaits it.
    arrived.catch(() => undefined);
    for (const [index, outgoing] of messages.entries()) {
      // An answer before the last message is an error to an earlier one: the rest is not sent.
      if (this.waiter === null) break;
      if (outgoing.type === 'confirm') {
        this.confirmation = numbers[index];
      }
      if (!(await this.write(plaintexts[index]))) break;
      if (outgoing.then) {
        this.channel = outgoing.then;
      }
    }
    if (this.waiter !== null) {
      this.timer = setTimeout(() => void this.end('timeout'), this.settings.answer_timeout * 1000);
    }
    const bytes = await arrived;
    return { message: this.read(operation, bytes, numbers, answer), bytes, sent: plaintexts };
  }

  /** The bytes of the app's message `outgoing`, numbered `seq`, checked as the device will
   * check them; `encrypted` if they will be. */
  private compose(outgoing: Outgoing, seq: number, encrypted: boolean): Uint8Array {
    const bytes = encodeMessage({ type: outgoing.type, seq, ...outgoing.fields });
    decodeMessage(bytes, 'from_app');
    if (bytes.length + (encrypted ? TAG_BYTES : 0) > MAX_MESSAGE) {
      throw new RangeError(`${outgoing.type}: a message has at most ${MAX_MESSAGE} bytes`);
    }
    return bytes;
  }

  /** Writes one message, sealed once the exchange is done; `false` if the link ended. An answer
   * that came before stays to be read. */
  private async write(plaintext: Uint8Array): Promise<boolean> {
    const bytes = this.channel === null ? plaintext : this.channel.seal(plaintext);
    try {
      for (const fragment of split(bytes, this.link.fragmentSize)) {
        await this.link.write(fragment);
      }
      return true;
    } catch {
      void this.end('ended');
      return false;
    }
  }

  /** One of the device's fragments. */
  private take(value: Uint8Array): void {
    // The device speaks only to answer: a fragment while nothing is asked ends the session
    // before it is kept, so that a device cannot make the app hold what it sends unasked.
    const waiter = this.waiter;
    if (waiter === null) {
      void this.end('broken');
      return;
    }
    let message: Uint8Array | null;
    try {
      message = this.joiner.add(value);
    } catch (error) {
      if (!(error instanceof FragmentError)) throw error;
      void this.end('broken');
      return;
    }
    if (message === null) {
      return;
    }
    this.waiter = null;
    this.stopTimer();
    waiter.resolve(message);
  }

  /** The device's answer in `bytes`, checked: `DeviceRefused` for an error it answered, and
   * `SessionLost` for anything that breaks set-up. */
  private read(operation: string, bytes: Uint8Array, numbers: number[], answer: string) {
    let message: Setup.Message;
    try {
      message = this.decode(bytes);
    } catch (error) {
      if (!(error instanceof ProtocolError || error instanceof SealError)) throw error;
      return this.broken(operation);
    }
    if (message.seq !== this.received + 1) {
      return this.broken(operation);
    }
    this.received = message.seq;
    if (message.type === 'error') {
      if (message.reply_to !== undefined && !numbers.includes(message.reply_to)) {
        return this.broken(operation);
      }
      const answered =
        message.reply_to === undefined ? operation : this.types.get(message.reply_to);
      throw new DeviceRefused(answered ?? operation, String(message.code));
    }
    if (message.type !== answer || message.reply_to !== numbers[numbers.length - 1]) {
      return this.broken(operation);
    }
    return message;
  }

  /** The device's message in `bytes`: in the clear until the exchange is done, then encrypted.
   * Its error to the app's confirmation alone comes in the clear after it, since it has no keys
   * then. */
  private decode(bytes: Uint8Array): Setup.Message {
    if (this.channel === null) {
      return decodeMessage(bytes, 'from_device');
    }
    try {
      return decodeMessage(this.channel.open(bytes), 'from_device');
    } catch (error) {
      if (!(error instanceof SealError)) throw error;
      let message: Setup.Message;
      try {
        message = decodeMessage(bytes, 'from_device');
      } catch {
        throw error;
      }
      if (message.type !== 'error' || message.reply_to !== this.confirmation) throw error;
      return message;
    }
  }

  private broken(operation: string): never {
    void this.end('broken');
    throw new SessionLost(operation, 'broken');
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** Ends the session for `reason`, once: settles when the link is closed. */
  private end(reason: LossReason): Promise<void> {
    if (this.closing !== null) {
      return this.closing;
    }
    this.lost = reason;
    this.stopTimer();
    this.unlisten?.();
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.reject(new SessionLost(this.operation, reason));
    this.closing = this.link.close().catch(() => undefined);
    return this.closing;
  }
}

/** What a device's hello gave: its discriminator, which tells the app whether it is the device
 * whose code it holds. No code has been tried on it yet, so closing it costs the device nothing. */
export class Greeting {
  constructor(
    private readonly conversation: Conversation,
    /** The discriminator the device shows beside its code. */
    readonly discriminator: string,
    private readonly context: Uint8Array,
    private readonly salt: Uint8Array,
    private readonly random: Random,
  ) {}

  private tried = false;

  /**
   * SPAKE2+ with `code`, the 8 digits the device shows, then its `info`, the first of the
   * requests, which proves that the device took the app's confirmation.
   *
   * `NotConfirmed`, or `DeviceRefused` with `code`, for a code that is not the device's: the
   * device then shows another, for a new session. Any failure ends this one.
   */
  async exchange(code: string): Promise<{ session: Session; info: DeviceInfo }> {
    if (!CODE.test(code)) {
      throw new RangeError(`a code has ${CODE_DIGITS} digits`);
    }
    if (this.tried) {
      throw new Error('a session tries one code');
    }
    this.tried = true;
    try {
      const secret = await stretch(encoder.encode(code), this.salt);
      const prover = new Prover(this.context, secret, randomScalar(this.random));
      const { message: shared } = await this.conversation.ask(
        'share',
        [{ type: 'share', fields: { share: base64url(prover.share) } }],
        'share',
      );
      const reply = shared as Setup.Message & Setup.DeviceShare;
      let finished: { confirmation: Uint8Array; shared: Uint8Array };
      try {
        finished = prover.finish(checkedBase64url(reply.share), checkedBase64url(reply.confirm));
      } catch (error) {
        if (!(error instanceof ExchangeError)) throw error;
        if (error.kind === 'confirmation') throw new NotConfirmed();
        throw new SessionLost('share', 'broken');
      }
      const keys = sessionKeys(finished.shared);
      const { message } = await this.conversation.ask(
        'info',
        [
          {
            type: 'confirm',
            fields: { confirm: base64url(finished.confirmation) },
            then: new Channel(keys.app, keys.device),
          },
          { type: 'info' },
        ],
        'info',
      );
      return { session: new Session(this.conversation), info: infoOf(message) };
    } catch (error) {
      await this.conversation.close();
      throw error;
    }
  }

  /** Disconnects, without trying a code: the device whose discriminator is not the code's. */
  close(): Promise<void> {
    return this.conversation.close();
  }
}

function infoOf(message: Setup.Message): DeviceInfo {
  const { device, bound, network } = message as Setup.Message & Setup.Info;
  return { device, bound, network };
}

/**
 * Says hello to the device at the end of `link`, and gives its hello: its discriminator, and
 * what the exchange needs. `DeviceRefused` with `busy` for a device that runs another session,
 * or `version` for one that speaks no version of the app's. Any failure ends the session.
 */
export async function greet(link: Link, { random, settings }: SessionOptions): Promise<Greeting> {
  let conversation: Conversation;
  try {
    conversation = new Conversation(link, settings);
  } catch (error) {
    await link.close().catch(() => undefined);
    throw error;
  }
  try {
    const hello: Outgoing = { type: 'hello', fields: { protocol: PROTOCOL } };
    const { message, bytes, sent } = await conversation.ask('hello', [hello], 'hello');
    const { protocol, discriminator, salt } = message as Setup.Message & Setup.DeviceHello;
    if (major(protocol) !== major(PROTOCOL)) {
      throw new SessionLost('hello', 'broken');
    }
    return new Greeting(
      conversation,
      discriminator,
      context(sent[0], bytes),
      checkedBase64url(salt),
      random,
    );
  } catch (error) {
    await conversation.close();
    throw error;
  }
}

/** An open session: the requests, encrypted, one at a time. A device's error comes as
 * `DeviceRefused`, and leaves the session open; a `SessionLost` ends it. */
export class Session {
  constructor(private readonly conversation: Conversation) {}

  /** The device, whether it is bound, and its network. */
  async info(): Promise<DeviceInfo> {
    const { message } = await this.conversation.ask('info', [{ type: 'info' }], 'info');
    return infoOf(message);
  }

  /** The networks the device sees, after a scan, the strongest first. */
  async networks(): Promise<Network[]> {
    const { message } = await this.conversation.ask('networks', [{ type: 'networks' }], 'networks');
    return (message as Setup.Message & Setup.Networks).networks;
  }

  /** Joins `network`: the network the device is then on. `DeviceRefused` with `wrong_password`,
   * `not_found`, `no_address` or `network` if it could not. */
  async join(network: JoinRequest): Promise<NetworkStatus> {
    const { message } = await this.conversation.ask(
      'join',
      [{ type: 'join', fields: network }],
      'joined',
    );
    return (message as Setup.Message & Setup.Joined).network;
  }

  /** Gives the device the home's languages and time zone, either or both: what it keeps.
   * `DeviceRefused` with `time_zone` for a time zone it does not know. */
  async configure(settings: Partial<Configured>): Promise<Configured> {
    const { message } = await this.conversation.ask(
      'configure',
      [{ type: 'configure', fields: settings }],
      'configured',
    );
    const { languages, time_zone } = message as Setup.Message & Setup.Configured;
    return { languages, time_zone };
  }

  /** The device's registration, signed, for the cloud's `challenge` and `server`. `DeviceRefused`
   * with `bound` for a device that is bound already. */
  async register(challenge: string, server: string): Promise<string> {
    const { message } = await this.conversation.ask(
      'register',
      [{ type: 'register', fields: { challenge, server } }],
      'registration',
    );
    return (message as Setup.Message & Setup.Registration).registration;
  }

  /** Ends set-up on the device, which closes it, then the session. */
  async finish(): Promise<void> {
    await this.conversation.ask('finish', [{ type: 'finish' }], 'finished');
    await this.conversation.close();
  }

  /** Ends the session, without `finish`: the device stays in set-up. */
  close(): Promise<void> {
    return this.conversation.close();
  }
}

// SPDX-License-Identifier: MIT
// A device in set-up, simulated in memory, as the robot runs set-up 2.2
// (platform/protocols/setup/README.md; ai-robot, core/setup_session.py and modules/setup.py):
// its code, its networks, its settings and its key. It reads every message of the app's as JSON
// that every side can hold, checks it against the schema, and answers as a device would, errors
// included. Each `connect` gives a link to it.
import { p256 } from '@noble/curves/nist.js';

import { base64url, checkedBase64url, cryptoRandom, type Random } from '@/src/shared/bytes';
import { ProtocolError, setupChecked, type Setup } from '@/src/shared/protocols';

import { Channel, context, SealError, sessionKeys } from '../../domain/channel';
import { FragmentError, Joiner, split } from '../../domain/fragments';
import { encodeMessage, readMessage, seqOf } from '../../domain/messages';
import {
  CODE_DIGITS,
  major,
  MAX_NETWORKS,
  MIN_FRAGMENT,
  PROTOCOL,
  SALT_BYTES,
  SSID_BYTES,
} from '../../domain/protocol';
import { ExchangeError, randomScalar, record, stretch, Verifier } from '../../domain/spake2plus';
import type { Link, LinkListener } from '../../ports/link';

/** A network that the simulated device can reach. */
export interface SimulatedNetwork {
  /** Its name, or its name's bytes in hexadecimal: the device reads both as bytes, and gives them
   * back as set-up does, in `ssid_hex` if they are not UTF-8 or hold a NUL byte. A scan's name of
   * no bytes, of NUL bytes alone or of one space is a hidden network's, as NetworkManager reads it:
   * the device leaves it out of `networks`. */
  ssid?: string;
  ssid_hex?: string;
  security: Setup.Network['security'];
  signal: number;
  /** The password it takes, unless it is open. */
  password?: string;
  /** Whether it does not announce itself: it is joined only with `hidden`. */
  hidden?: boolean;
}

/** The code, the discriminator and the salt that a device draws for each attempt. */
export interface SetupSecret {
  code: string;
  discriminator: string;
  salt: Uint8Array;
}

export interface SimulatedDeviceOptions {
  random?: Random;
  /** What `info` says of the device. */
  device?: Partial<Omit<Setup.Info['device'], 'languages' | 'time_zone'>>;
  /** The languages the device supports, its own first. */
  languages?: string[];
  time_zone?: string;
  /** Whether a time zone is one the device knows: by default, one that `Intl` knows. */
  knowsTimeZone?: (zone: string) => boolean;
  networks?: SimulatedNetwork[];
  /** The address the device gets on a network. */
  address?: string;
  /** Whether the device is bound already. */
  bound?: boolean;
  /** The bytes in each fragment its links take: the ATT MTU minus 3. */
  fragmentSize?: number;
  /** The first attempt's secret, to replay an example; drawn otherwise. */
  secret?: SetupSecret;
}

/** The device's message for people, with each error code it answers. */
const ERRORS = {
  version: 'no common major version',
  busy: 'another session runs',
  code: 'the confirmation is wrong',
  protocol: 'a message out of place, or one that breaks the schema',
  unknown: 'an unknown request',
  wrong_password: 'the network refused the password',
  not_found: 'the network is out of reach',
  network: 'joining failed',
  time_zone: 'an unknown time zone',
  bound: 'the device is bound already',
  server: 'the server is not an address the device accepts',
} as const;
type DeviceError = keyof typeof ERRORS;

/** `server`, as set-up lets it: `https://`, or `http://` to the device itself (Limits). */
const SECURE_SERVER = /^https:\/\/\S+$/;
const LOCAL_SERVER = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:[0-9]{1,5})?(\/\S*)?$/;
const REGISTRATION_TYPE = 'device-registration+jwt';
/** Random bytes in a registration's `jti`. */
const JTI_BYTES = 12;
/** How many codes there are. */
const CODES = 10 ** CODE_DIGITS;

function knownToIntl(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** A version 4 UUID (RFC 9562, 5.4). */
function randomUuid(random: Random): string {
  const bytes = random(16);
  bytes[6] = 0x40 | (bytes[6] & 0x0f);
  bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A code of 8 digits, uniform: 32 random bits, drawn again when they fall past the last whole
 * run of codes. */
function randomCode(random: Random): string {
  const limit = 2 ** 32 - (2 ** 32 % CODES);
  for (;;) {
    const value = new DataView(random(4).buffer).getUint32(0);
    if (value < limit) {
      return String(value % CODES).padStart(CODE_DIGITS, '0');
    }
  }
}

function drawSecret(random: Random): SetupSecret {
  const discriminator = new DataView(random(2).buffer).getUint16(0);
  return {
    code: randomCode(random),
    discriminator: discriminator.toString(16).toUpperCase().padStart(4, '0'),
    salt: random(SALT_BYTES),
  };
}

/** A network's name, as bytes: from `ssid` in UTF-8, or from `ssid_hex` (ai-robot's
 * `ssid_bytes`). */
function nameBytes(named: { ssid?: string; ssid_hex?: string }): Uint8Array {
  if (named.ssid !== undefined) {
    return new TextEncoder().encode(named.ssid);
  }
  const hex = named.ssid_hex ?? '';
  return Uint8Array.from({ length: hex.length / 2 }, (_, index) =>
    parseInt(hex.slice(index * 2, index * 2 + 2), 16),
  );
}

/** How set-up gives the name `name`: `ssid` if it is UTF-8 without a NUL byte, which no text may
 * hold (ADR-0014), and otherwise `ssid_hex` (ai-robot's `ssid_fields`). */
function nameFields(name: Uint8Array): { ssid: string } | { ssid_hex: string } {
  let text: string | null;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(name);
  } catch {
    text = null;
  }
  if (text === null || name.includes(0)) {
    return { ssid_hex: Array.from(name, (byte) => byte.toString(16).padStart(2, '0')).join('') };
  }
  return { ssid: text };
}

/** Whether a scan's `name` is a hidden network's: no bytes, NUL bytes alone (hostapd's
 * `ignore_broadcast_ssid` 1 and 2), or one space, all of which NetworkManager reads as hidden
 * (`_nm_utils_is_empty_ssid_arr`; ai-robot's `_hidden`). */
function hiddenName(name: Uint8Array): boolean {
  return name.every((byte) => byte === 0) || (name.length === 1 && name[0] === 0x20);
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/** What a request was answered with: an answer's type and fields, or an error's code. */
type Reply = { type: string; fields?: Record<string, unknown> } | { error: DeviceError };

export class SimulatedDevice {
  private readonly random: Random;
  private readonly identity: Omit<Setup.Info['device'], 'languages' | 'time_zone'>;
  private readonly supported: string[];
  private readonly knowsTimeZone: (zone: string) => boolean;
  private readonly fragmentSize: number;
  private readonly address: string;
  private readonly key: Uint8Array;
  private readonly nearby: SimulatedNetwork[];
  private readonly saved = new Set<SimulatedNetwork>();
  private current: SimulatedNetwork | null = null;
  private secretNow: SetupSecret;
  /** The session that has said hello, until it ends. */
  private running: DeviceSession | null = null;
  /** The device's settings. */
  languages: string[];
  timeZone: string;
  /** Whether it is bound: the test or the simulated cloud says so. */
  bound: boolean;
  /** The server of its last registration. */
  server: string | null = null;
  /** Whether a session has finished set-up. */
  finished = false;

  constructor(options: SimulatedDeviceOptions = {}) {
    this.random = options.random ?? cryptoRandom;
    this.identity = {
      id: options.device?.id ?? randomUuid(this.random),
      name: options.device?.name ?? 'Robot',
      kind: options.device?.kind ?? 'robot',
      model: options.device?.model ?? 'simulated',
      software: options.device?.software ?? '0.0.0',
    };
    this.supported = options.languages ?? ['en', 'vi'];
    this.languages = [this.supported[0]];
    this.timeZone = options.time_zone ?? 'UTC';
    this.knowsTimeZone = options.knowsTimeZone ?? knownToIntl;
    this.nearby = options.networks ?? [];
    this.address = options.address ?? '192.168.1.23';
    this.bound = options.bound ?? false;
    this.fragmentSize = options.fragmentSize ?? MIN_FRAGMENT;
    this.key = p256.Point.Fn.toBytes(randomScalar(this.random));
    this.secretNow = options.secret ?? drawSecret(this.random);
  }

  /** The code it shows now, and its discriminator: a new one after each attempt. */
  get secret(): SetupSecret {
    return this.secretNow;
  }

  /** The device's public key, as its registration's `jwk`. */
  get publicKey(): Uint8Array {
    return p256.getPublicKey(this.key, false);
  }

  /** A new connection to its set-up service, its indications enabled. */
  connect(): Link {
    const link = new SimulatedLink(this.fragmentSize);
    const session = new DeviceSession(this, link);
    link.onWrite = (fragment) => session.receive(fragment);
    link.onClose = () => session.ended();
    return link;
  }

  /** Whether `session` may run: no other one does. */
  begin(session: DeviceSession): boolean {
    if (this.running !== null && this.running !== session) {
      return false;
    }
    this.running = session;
    return true;
  }

  end(session: DeviceSession): void {
    if (this.running === session) {
      this.running = null;
    }
  }

  /** An attempt is over: the device shows a new code. */
  redraw(): void {
    this.secretNow = drawSecret(this.random);
  }

  scalar(): bigint {
    return randomScalar(this.random);
  }

  info(): Record<string, unknown> {
    return {
      device: { ...this.identity, languages: this.languages, time_zone: this.timeZone },
      bound: this.bound,
      network: this.status(),
    };
  }

  private status(): Setup.NetworkStatus {
    if (this.current === null) {
      return { state: 'disconnected' };
    }
    return {
      state: 'connected',
      ...nameFields(nameBytes(this.current)),
      address: this.address,
      internet: true,
    };
  }

  /** The answer to the request `message`. */
  request(message: Setup.Message): Reply {
    switch (message.type) {
      case 'info':
        return { type: 'info', fields: this.info() };
      case 'networks':
        return {
          type: 'networks',
          fields: {
            // A network that hides its name, and one whose name is too long, are left out, as
            // the robot does: the app could not name them back (Networks).
            networks: this.nearby
              .map((network) => ({ network, name: nameBytes(network) }))
              .filter(
                ({ network, name }) =>
                  !network.hidden && !hiddenName(name) && name.length <= SSID_BYTES,
              )
              .sort((a, b) => b.network.signal - a.network.signal)
              .slice(0, MAX_NETWORKS)
              .map(({ network, name }) => ({
                ...nameFields(name),
                security: network.security,
                signal: network.signal,
                saved: this.saved.has(network),
              })),
          },
        };
      case 'join':
        return this.join(message as Setup.Message & Setup.Join);
      case 'configure':
        return this.configure(message as Setup.Message & Setup.Configure);
      case 'register':
        return this.register(message as Setup.Message & Setup.Register);
      case 'finish':
        this.finished = true;
        return { type: 'finished' };
      default:
        return { error: 'unknown' };
    }
  }

  /** Joins the network that `request` names, listed or not: a hidden one only with `hidden`, which
   * makes the device probe for it by its name (Networks). */
  private join(request: Setup.Message & Setup.Join): Reply {
    const name = nameBytes(request);
    if (name.length > SSID_BYTES) {
      return { error: 'protocol' };
    }
    const network = this.nearby.find(
      (candidate) =>
        sameBytes(nameBytes(candidate), name) && (!candidate.hidden || request.hidden === true),
    );
    if (network === undefined) {
      return { error: 'not_found' };
    }
    if (network.security === 'other') {
      return { error: 'network' };
    }
    const known = this.saved.has(network) && request.password === undefined;
    if (network.security !== 'open' && !known && request.password !== network.password) {
      return { error: 'wrong_password' };
    }
    this.saved.add(network);
    this.current = network;
    return { type: 'joined', fields: { network: this.status() } };
  }

  private configure(request: Setup.Message & Setup.Configure): Reply {
    if (request.time_zone !== undefined && !this.knowsTimeZone(request.time_zone)) {
      return { error: 'time_zone' };
    }
    if (request.languages !== undefined) {
      const kept = request.languages.filter((language) => this.supported.includes(language));
      this.languages = kept.length > 0 ? kept : this.languages;
    }
    this.timeZone = request.time_zone ?? this.timeZone;
    return { type: 'configured', fields: { languages: this.languages, time_zone: this.timeZone } };
  }

  private register(request: Setup.Message & Setup.Register): Reply {
    if (this.bound) {
      return { error: 'bound' };
    }
    if (!SECURE_SERVER.test(request.server) && !LOCAL_SERVER.test(request.server)) {
      return { error: 'server' };
    }
    this.server = request.server;
    return { type: 'registration', fields: { registration: this.sign(request) } };
  }

  /** The registration (The registration): a JWT that the device's key signs with ES256. */
  private sign(request: Setup.Register): string {
    const point = this.publicKey;
    const half = (point.length - 1) / 2;
    const header = {
      alg: 'ES256',
      jwk: {
        crv: 'P-256',
        kty: 'EC',
        x: base64url(point.subarray(1, 1 + half)),
        y: base64url(point.subarray(1 + half)),
      },
      typ: REGISTRATION_TYPE,
    };
    const claims = {
      iss: this.identity.id,
      sub: this.identity.id,
      aud: request.server,
      nonce: request.challenge,
      jti: base64url(this.random(JTI_BYTES)),
    };
    const encoder = new TextEncoder();
    const signed = `${base64url(encoder.encode(JSON.stringify(header)))}.${base64url(encoder.encode(JSON.stringify(claims)))}`;
    // ES256 signs SHA-256 of the input, as r and s, 32 bytes each (RFC 7518, 3.4).
    return `${signed}.${base64url(p256.sign(encoder.encode(signed), this.key))}`;
  }
}

/** A message of the device's, before its number. */
type Unnumbered = { type: string; reply_to?: number; [field: string]: unknown };

type Stage = 'hello' | 'share' | 'confirm' | 'requests' | 'over';

/** One connection's session, on the device's side. */
class DeviceSession {
  private readonly joiner = new Joiner();
  private stage: Stage = 'hello';
  /** Whether the app sent its share: an attempt with the code. */
  private attempted = false;
  private sent = 0;
  private received = 0;
  private context: Uint8Array | null = null;
  private verifier: Verifier | null = null;
  private channel: Channel | null = null;
  private work: Promise<void> = Promise.resolve();

  constructor(
    private readonly device: SimulatedDevice,
    private readonly link: SimulatedLink,
  ) {}

  /** One of the app's fragments, handled after those before it. */
  receive(fragment: Uint8Array): void {
    this.work = this.work.then(() => this.take(fragment));
  }

  ended(): void {
    // Each code serves one attempt, as on the robot (ai-robot `modules/setup.py`, `_after`):
    // once the app has sent its share, the device draws a new code when the session ends (A
    // failed attempt). After `finish`, set-up is over and shows no code.
    if (this.attempted) {
      this.device.redraw();
    }
    this.stage = 'over';
    this.device.end(this);
  }

  private async take(fragment: Uint8Array): Promise<void> {
    if (this.stage === 'over') {
      return;
    }
    let bytes: Uint8Array | null;
    try {
      bytes = this.joiner.add(fragment);
    } catch (error) {
      if (!(error instanceof FragmentError)) throw error;
      return this.close();
    }
    if (bytes === null) {
      return;
    }
    // An error replies to the message it is about whenever its `seq` can be read: only one that
    // cannot be decrypted, or read, gets none (Errors).
    let value: unknown;
    try {
      value = readMessage(this.channel === null ? bytes : this.channel.open(bytes), 'from_app');
    } catch (error) {
      if (!(error instanceof SealError || error instanceof ProtocolError)) throw error;
      return this.fail('protocol');
    }
    let message: Setup.Message;
    try {
      message = setupChecked('from_app', value);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      return this.fail('protocol', seqOf(value));
    }
    if (message.seq !== this.received + 1) {
      return this.fail('protocol', message.seq);
    }
    this.received = message.seq;
    await this.handle(message, bytes);
  }

  private async handle(message: Setup.Message, bytes: Uint8Array): Promise<void> {
    const expected = { hello: 'hello', share: 'share', confirm: 'confirm' } as const;
    if (
      this.stage !== 'requests' &&
      message.type !== expected[this.stage as keyof typeof expected]
    ) {
      return this.fail('protocol', message.seq);
    }
    switch (this.stage) {
      case 'hello':
        return this.hello(message as Setup.Message & Setup.AppHello, bytes);
      case 'share':
        return this.share(message as Setup.Message & Setup.AppShare);
      case 'confirm':
        return this.confirm(message as Setup.Message & Setup.Confirm);
      default:
        return this.request(message);
    }
  }

  private hello(message: Setup.Message & Setup.AppHello, bytes: Uint8Array): void {
    // A second app gets `busy`, whatever version it speaks, as from the robot.
    if (!this.device.begin(this)) {
      return this.fail('busy', message.seq);
    }
    if (major(message.protocol) !== major(PROTOCOL)) {
      return this.fail('version', message.seq);
    }
    const { discriminator, salt } = this.device.secret;
    const sent = this.send({
      type: 'hello',
      reply_to: message.seq,
      protocol: PROTOCOL,
      discriminator,
      salt: base64url(salt),
    });
    this.context = context(bytes, sent);
    this.stage = 'share';
  }

  private async share(message: Setup.Message & Setup.AppShare): Promise<void> {
    this.attempted = true;
    const { code, salt } = this.device.secret;
    const secret = await stretch(new TextEncoder().encode(code), salt);
    // The app may have left while the code was stretched.
    if (this.stage === 'over') {
      return;
    }
    this.verifier = new Verifier(
      this.context ?? new Uint8Array(0),
      secret.w0,
      record(secret.w1),
      this.device.scalar(),
    );
    let answer: { share: Uint8Array; confirmation: Uint8Array };
    try {
      answer = this.verifier.respond(checkedBase64url(message.share));
    } catch (error) {
      if (!(error instanceof ExchangeError)) throw error;
      return this.fail('protocol', message.seq);
    }
    this.send({
      type: 'share',
      reply_to: message.seq,
      share: base64url(answer.share),
      confirm: base64url(answer.confirmation),
    });
    this.stage = 'confirm';
  }

  private confirm(message: Setup.Message & Setup.Confirm): void {
    let shared: Uint8Array;
    try {
      shared = (this.verifier as Verifier).finish(checkedBase64url(message.confirm));
    } catch (error) {
      if (!(error instanceof ExchangeError)) throw error;
      return this.fail('code', message.seq);
    }
    const keys = sessionKeys(shared);
    this.channel = new Channel(keys.device, keys.app);
    this.stage = 'requests';
  }

  private request(message: Setup.Message): void {
    if (message.type === 'hello' || message.type === 'share' || message.type === 'confirm') {
      return this.fail('protocol', message.seq);
    }
    const reply = this.device.request(message);
    if ('error' in reply) {
      this.error(reply.error, message.seq);
      return;
    }
    this.send({ type: reply.type, reply_to: message.seq, ...reply.fields });
    if (reply.type === 'finished') {
      this.close();
    }
  }

  /** Sends `message`, numbered, sealed once the exchange is done: its bytes before sealing. */
  private send({ type, ...fields }: Unnumbered): Uint8Array {
    this.sent += 1;
    const bytes = encodeMessage({ type, seq: this.sent, ...fields });
    const sealed = this.channel === null ? bytes : this.channel.seal(bytes);
    for (const fragment of split(sealed, this.link.fragmentSize)) {
      this.link.indicate(fragment);
    }
    return bytes;
  }

  private error(code: DeviceError, replyTo?: number): void {
    this.send({ type: 'error', reply_to: replyTo, code, message: ERRORS[code] });
  }

  /** Answers the error `code`, then ends the session. */
  private fail(code: DeviceError, replyTo?: number): void {
    this.error(code, replyTo);
    this.close();
  }

  private close(): void {
    this.ended();
    this.link.end();
  }
}

/** The link that a simulated device gives: each indication comes after the write that caused it
 * has settled, as over the radio. */
class SimulatedLink implements Link {
  onWrite: (fragment: Uint8Array) => void = () => undefined;
  onClose: () => void = () => undefined;
  private listener: LinkListener | null = null;
  private over = false;
  private delivery: Promise<void> = Promise.resolve();

  constructor(readonly fragmentSize: number) {}

  async write(fragment: Uint8Array): Promise<void> {
    if (this.over) {
      throw new Error('the link has ended');
    }
    this.onWrite(Uint8Array.from(fragment));
  }

  listen(listener: LinkListener): () => void {
    if (this.over) {
      listener.closed();
      return () => undefined;
    }
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = null;
    };
  }

  async close(): Promise<void> {
    if (!this.over) {
      this.onClose();
      this.end();
    }
  }

  /** The device indicates `fragment`. */
  indicate(fragment: Uint8Array): void {
    this.later(() => this.listener?.fragment(fragment));
  }

  /** The device ends the link, after what it indicated. */
  end(): void {
    if (this.over) return;
    this.over = true;
    this.later(() => this.listener?.closed());
  }

  private later(deliver: () => void): void {
    this.delivery = this.delivery.then(deliver);
  }
}

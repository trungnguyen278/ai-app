// SPDX-License-Identifier: MIT
// A set-up session, the app's side, against the simulated device, and against a scripted device
// over a fake link for what a device should never do (platform/protocols/setup/README.md).
import { p256 } from '@noble/curves/nist.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { base64url, checkedBase64url, cryptoRandom } from '@/src/shared/bytes';
import { runtimeSettings } from '@/src/shared/config';
import { ProtocolError, type Setup } from '@/src/shared/protocols';
import {
  DeviceRefused,
  greet,
  NotConfirmed,
  SessionLost,
  SimulatedDevice,
  type Link,
  type LinkListener,
  type SimulatedNetwork,
} from '@/src/setup';
import { Channel, context, sessionKeys } from '@/src/setup/domain/channel';
import { Joiner, split } from '@/src/setup/domain/fragments';
import { decodeMessage, encodeMessage } from '@/src/setup/domain/messages';
import { Conversation } from '@/src/setup/services/session';
import { Prover, randomScalar, record, stretch, Verifier } from '@/src/setup/domain/spake2plus';

const settings = runtimeSettings().setup;
const options = { random: cryptoRandom, settings };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const example = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'platform', 'protocols', 'setup', 'examples', 'session.json'),
    'utf8',
  ),
);
type Entry = { from: string; message: Setup.Message & Record<string, unknown> };
const messages: Entry[] = example.messages;
const fromDevice = messages
  .filter((entry) => entry.from === 'device')
  .map((entry) => entry.message);
const fromApp = messages.filter((entry) => entry.from === 'app').map((entry) => entry.message);
/** The fields of the device's answer numbered `seq` in the example, without its numbers. */
function answerFields(seq: number) {
  const { type: _type, seq: _seq, reply_to: _replyTo, ...fields } = fromDevice[seq - 1];
  return fields;
}

const NETWORKS: SimulatedNetwork[] = [
  { ssid: 'Café', security: 'open', signal: 40 },
  { ssid: 'Home', security: 'wpa2', signal: 80, password: 'correct horse battery' },
  { ssid_hex: 'ff00ab', security: 'wpa3', signal: 25, password: 'hex password' },
  { ssid: 'Office', security: 'other', signal: 30 },
  { ssid: 'Hidden', security: 'wpa2', signal: 90, password: 'quiet place', hidden: true },
];

function exampleDevice(extra: ConstructorParameters<typeof SimulatedDevice>[0] = {}) {
  const info = fromDevice[2] as Setup.Message & Setup.Info;
  const { languages: _languages, time_zone, ...identity } = info.device;
  return new SimulatedDevice({
    device: identity,
    languages: ['vi', 'en'],
    time_zone,
    networks: NETWORKS,
    ...extra,
  });
}

/** Lets the simulated device and the link deliver what is queued. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
}

describe('a whole set-up, against the simulated device', () => {
  test('goes as the example goes', async () => {
    const device = exampleDevice();
    const link = device.connect();
    const greeting = await greet(link, options);
    expect(greeting.discriminator).toBe(device.secret.discriminator);
    const { session, info } = await greeting.exchange(device.secret.code);
    expect(info).toEqual(answerFields(3));
    expect(await session.info()).toEqual(answerFields(3));

    const networks = await session.networks();
    expect(networks).toEqual([
      { ssid: 'Home', security: 'wpa2', signal: 80, saved: false },
      { ssid: 'Café', security: 'open', signal: 40, saved: false },
      { ssid: 'Office', security: 'other', signal: 30, saved: false },
      { ssid_hex: 'ff00ab', security: 'wpa3', signal: 25, saved: false },
    ]);

    const wrong = session.join({ ssid: 'Home', password: fromApp[5].password as string });
    await expect(wrong).rejects.toThrow(new DeviceRefused('join', 'wrong_password'));
    expect(await session.join({ ssid: 'Home', password: 'correct horse battery' })).toEqual({
      state: 'connected',
      ssid: 'Home',
      address: '192.168.1.23',
      internet: true,
    });
    const configure = fromApp[7] as Setup.Message & Setup.Configure;
    const configured = await session.configure({
      languages: configure.languages,
      time_zone: configure.time_zone,
    });
    expect(configured).toEqual(answerFields(7));

    const register = fromApp[8] as Setup.Message & Setup.Register;
    const registration = await session.register(register.challenge, register.server);
    const [header, claims, signature] = registration.split('.');
    const read = (part: string) => JSON.parse(decoder.decode(checkedBase64url(part)));
    expect(read(header)).toEqual({
      alg: 'ES256',
      jwk: expect.objectContaining({ kty: 'EC', crv: 'P-256' }),
      typ: 'device-registration+jwt',
    });
    expect(read(claims)).toEqual({
      iss: info.device.id,
      sub: info.device.id,
      aud: register.server,
      nonce: register.challenge,
      jti: expect.stringMatching(/^[A-Za-z0-9_-]{16}$/),
    });
    const jwk = read(header).jwk;
    const key = Uint8Array.of(4, ...checkedBase64url(jwk.x), ...checkedBase64url(jwk.y));
    expect(key).toEqual(device.publicKey);
    const signed = encoder.encode(`${header}.${claims}`);
    expect(p256.verify(checkedBase64url(signature), signed, key)).toBe(true);
    expect(device.server).toBe(register.server);

    await session.finish();
    expect(device.finished).toBe(true);
    await expect(session.info()).rejects.toThrow(new SessionLost('info', 'ended'));
  });

  test('a wrong code is not confirmed, and the device shows another', async () => {
    const device = exampleDevice();
    const link = device.connect();
    const first = device.secret;
    const greeting = await greet(link, options);
    const wrong = first.code === '00000000' ? '11111111' : '00000000';
    await expect(greeting.exchange(wrong)).rejects.toThrow(NotConfirmed);
    await settle();
    expect(device.secret).not.toEqual(first);
    await expect(link.write(Uint8Array.of(0xc0, 0, 1, 1))).rejects.toThrow();

    const again = await greet(device.connect(), options);
    expect(again.discriminator).toBe(device.secret.discriminator);
    const { session } = await again.exchange(device.secret.code);
    await session.close();
  });

  test('a device runs one session at a time', async () => {
    const device = exampleDevice();
    const running = await greet(device.connect(), options);
    await expect(greet(device.connect(), options)).rejects.toThrow(
      new DeviceRefused('hello', 'busy'),
    );
    // `busy` answers a second app's hello, whatever version it speaks, as its reply (set-up 2.1).
    const second = device.connect();
    const answers: Uint8Array[] = [];
    const joiner = new Joiner();
    second.listen({
      fragment: (value) => {
        const message = joiner.add(value);
        if (message) answers.push(message);
      },
      closed: () => undefined,
    });
    for (const fragment of split(encodeMessage({ type: 'hello', seq: 1, protocol: '3.0' }), 20)) {
      await second.write(fragment);
    }
    await settle();
    expect(answers.map((answer) => decodeMessage(answer, 'from_device'))).toEqual([
      expect.objectContaining({ type: 'error', seq: 1, reply_to: 1, code: 'busy' }),
    ]);
    await running.close();
    await settle();
    const next = await greet(device.connect(), options);
    await next.close();
  });

  test('the device keeps the settings it can, and refuses what it cannot do', async () => {
    const device = exampleDevice({ bound: true, knowsTimeZone: (zone) => zone !== 'Mars/Base' });
    const greeting = await greet(device.connect(), options);
    const { session, info } = await greeting.exchange(device.secret.code);
    expect(info.bound).toBe(true);

    await expect(session.configure({ languages: ['en'], time_zone: 'Mars/Base' })).rejects.toThrow(
      new DeviceRefused('configure', 'time_zone'),
    );
    expect((await session.info()).device.languages).toEqual(['vi']);
    expect(await session.configure({ languages: ['fr', 'de'] })).toEqual({
      languages: ['vi'],
      time_zone: 'UTC',
    });
    expect(await session.configure({ languages: ['en', 'fr', 'vi'] })).toEqual({
      languages: ['en', 'vi'],
      time_zone: 'UTC',
    });
    expect(await session.configure({ time_zone: 'Asia/Tokyo' })).toEqual({
      languages: ['en', 'vi'],
      time_zone: 'Asia/Tokyo',
    });
    await expect(
      session.register('q7Hn2xWf0cJm4Lr9Vb8sKt', 'https://cloud.example'),
    ).rejects.toThrow(new DeviceRefused('register', 'bound'));
    await session.close();
  });

  test('a device registers with a secure server, or one on itself', async () => {
    const device = exampleDevice();
    const { session } = await (await greet(device.connect(), options)).exchange(device.secret.code);
    const challenge = 'q7Hn2xWf0cJm4Lr9Vb8sKt';
    for (const server of ['http://cloud.example', 'http://localhost.example', 'https://']) {
      await expect(session.register(challenge, server)).rejects.toThrow(
        new DeviceRefused('register', 'server'),
      );
    }
    for (const server of ['http://localhost:8080/api', 'http://127.0.0.1', 'http://[::1]:80']) {
      expect(await session.register(challenge, server)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(device.server).toBe(server);
    }
    await session.close();
  });

  test('a device joins the networks it reaches, as they ask', async () => {
    const device = exampleDevice();
    const { session } = await (await greet(device.connect(), options)).exchange(device.secret.code);
    const refused = (code: string) => expect.objectContaining({ operation: 'join', code });
    await expect(session.join({ ssid: 'Elsewhere' })).rejects.toEqual(refused('not_found'));
    await expect(session.join({ ssid: 'Hidden', password: 'quiet place' })).rejects.toEqual(
      refused('not_found'),
    );
    await expect(session.join({ ssid: 'Office' })).rejects.toEqual(refused('network'));
    await expect(session.join({ ssid: 'Home' })).rejects.toEqual(refused('wrong_password'));
    expect(
      await session.join({
        ssid: 'Hidden',
        password: 'quiet place',
        hidden: true,
        security: 'wpa2',
      }),
    ).toEqual(expect.objectContaining({ ssid: 'Hidden' }));
    expect(await session.join({ ssid: 'Café' })).toEqual(
      expect.objectContaining({ state: 'connected', ssid: 'Café' }),
    );
    expect(await session.join({ ssid_hex: 'ff00ab', password: 'hex password' })).toEqual({
      state: 'connected',
      ssid_hex: 'ff00ab',
      address: '192.168.1.23',
      internet: true,
    });
    // A saved network needs no password; a wrong one is still refused.
    await expect(
      session.join({ ssid: 'Hidden', hidden: true, security: 'wpa2', password: 'nope' }),
    ).rejects.toEqual(refused('wrong_password'));
    expect(await session.join({ ssid: 'Hidden', hidden: true, security: 'wpa2' })).toEqual(
      expect.objectContaining({ ssid: 'Hidden' }),
    );
    expect(
      (await session.networks()).map((network) => [
        network.ssid ?? network.ssid_hex,
        network.saved,
      ]),
    ).toEqual([
      ['Home', false],
      ['Café', true],
      ['Office', false],
      ['ff00ab', true],
    ]);
    // A request that the schema refuses is not sent, and the session goes on.
    await expect(session.join({ ssid: 'Home', password: '' })).rejects.toThrow(ProtocolError);
    expect((await session.info()).network.state).toBe('connected');
    await session.close();
  });

  test('the device lists the networks it can name back, and gives names as set-up 2.2 does', async () => {
    const many: SimulatedNetwork[] = Array.from({ length: 60 }, (_, index) => ({
      ssid: `Network ${index}`,
      security: 'wpa2',
      signal: index,
    }));
    const device = exampleDevice({
      networks: [
        { ssid: 'Strong', security: 'open', signal: 100 },
        // Hidden networks, as a scan finds them: no name, NUL bytes alone, or one space.
        { ssid_hex: '00', security: 'wpa2', signal: 99 },
        { ssid_hex: '000000', security: 'wpa2', signal: 99 },
        { ssid: ' ', security: 'wpa2', signal: 99 },
        // A name too long for set-up.
        { ssid: 'é'.repeat(17), security: 'open', signal: 99 },
        // A name that holds a NUL byte, one that is not UTF-8, and one that is, in hexadecimal.
        { ssid_hex: '61006200', security: 'open', signal: 98 },
        { ssid_hex: 'c3', security: 'open', signal: 97 },
        { ssid_hex: '4361666520', security: 'open', signal: 96, password: 'x' },
        { ssid: '  two ', security: 'open', signal: 95 },
        // A name that begins with the bytes of a byte order mark keeps them.
        { ssid_hex: 'efbbbf41', security: 'open', signal: 94 },
        ...many,
      ],
    });
    const { session } = await (await greet(device.connect(), options)).exchange(device.secret.code);
    const networks = await session.networks();
    expect(networks).toHaveLength(50);
    expect(
      networks.slice(0, 7).map((network) => network.ssid ?? `hex ${network.ssid_hex}`),
    ).toEqual([
      'Strong',
      'hex 61006200',
      'hex c3',
      'Cafe ',
      '  two ',
      `${String.fromCharCode(0xfeff)}A`,
      'Network 59',
    ]);
    // A name goes the same way wherever it goes: as the network the device is on, too.
    expect(await session.join({ ssid_hex: '61006200' })).toEqual(
      expect.objectContaining({ ssid_hex: '61006200' }),
    );
    expect(await session.join({ ssid: 'Cafe ' })).toEqual(
      expect.objectContaining({ ssid: 'Cafe ' }),
    );
    // A network that `networks` did not list may be joined too, by its name.
    expect(await session.join({ ssid: 'Network 0' })).toEqual(
      expect.objectContaining({ ssid: 'Network 0' }),
    );
    // A name of more than 32 bytes is no network's: the device refuses it, and goes on.
    await expect(session.join({ ssid: 'é'.repeat(17) })).rejects.toEqual(
      expect.objectContaining({ operation: 'join', code: 'protocol' }),
    );
    expect((await session.info()).network).toEqual(expect.objectContaining({ ssid: 'Network 0' }));
    await session.close();
  });

  test('fragments hold 512 bytes at most both ways, over a link that has more room', async () => {
    const device = exampleDevice({ fragmentSize: 514 });
    const link = device.connect();
    const sizes: number[] = [];
    const watched: Link = {
      fragmentSize: link.fragmentSize,
      write: (fragment) => {
        sizes.push(fragment.length);
        return link.write(fragment);
      },
      listen: (listener) =>
        link.listen({
          fragment: (value) => {
            sizes.push(value.length);
            listener.fragment(value);
          },
          closed: () => listener.closed(),
        }),
      close: () => link.close(),
    };
    expect(watched.fragmentSize).toBe(514);
    const { session } = await (await greet(watched, options)).exchange(device.secret.code);
    await session.configure({
      languages: Array.from(
        { length: 16 },
        (_, index) => `en-${String(index).padStart(8, '0')}-abcdefgh-abcdefgh`,
      ),
    });
    await session.register('c'.repeat(128), 'https://cloud.example');
    await session.close();
    expect(Math.max(...sizes)).toBe(512);
  });

  test('requests wait for each other, and leave no timer behind', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const device = exampleDevice();
      const greeting = await greet(device.connect(), options);
      expect(jest.getTimerCount()).toBe(0);
      const { session } = await greeting.exchange(device.secret.code);
      const [info, networks] = await Promise.all([session.info(), session.networks()]);
      expect([info.device.name, networks.length]).toEqual(['Robot', 4]);
      expect(jest.getTimerCount()).toBe(0);
      await session.close();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the simulated device, driven by hand', () => {
  /** A hand-made app on a link to `device`: what it writes, and what comes back. */
  function byHand(device: SimulatedDevice) {
    const link = device.connect();
    const joiner = new Joiner();
    const inbox: Uint8Array[] = [];
    let closed = false;
    link.listen({
      fragment: (value) => {
        const message = joiner.add(value);
        if (message) inbox.push(message);
      },
      closed: () => {
        closed = true;
      },
    });
    return {
      link,
      get closed() {
        return closed;
      },
      async send(bytes: Uint8Array) {
        for (const fragment of split(bytes, link.fragmentSize)) await link.write(fragment);
      },
      /** The device's next message, once it came. */
      async next(): Promise<Uint8Array | undefined> {
        for (let turn = 0; turn < 2000 && inbox.length === 0 && !closed; turn++) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        await settle();
        return inbox.shift();
      },
    };
  }
  const json = (bytes: Uint8Array | undefined) => JSON.parse(decoder.decode(bytes));
  const hello = encodeMessage({ type: 'hello', seq: 1, protocol: '2.0' });

  test('another major version, a message out of place, or a wrong seq ends the session', async () => {
    const cases: [Uint8Array, unknown][] = [
      [encodeMessage({ type: 'hello', seq: 1, protocol: '3.0' }), { code: 'version', reply_to: 1 }],
      [encodeMessage({ type: 'info', seq: 1 }), { code: 'protocol', reply_to: 1 }],
      [
        encodeMessage({ type: 'hello', seq: 2, protocol: '2.0' }),
        { code: 'protocol', reply_to: 2 },
      ],
      [encodeMessage({ type: 'hello', seq: 1 }), { code: 'protocol', reply_to: 1 }],
      [encodeMessage({ type: 'hello', seq: 1, protocol: 2 }), { code: 'protocol', reply_to: 1 }],
      // A message whose seq cannot be read, or that no side can hold, gets no reply_to.
      [encoder.encode('[1]'), { code: 'protocol', reply_to: undefined }],
      [
        encoder.encode('{"type":"hello","protocol":"2.2"}'),
        { code: 'protocol', reply_to: undefined },
      ],
      [
        encoder.encode('{"type":"hello","seq":0,"protocol":"2.2"}'),
        { code: 'protocol', reply_to: undefined },
      ],
      [
        encoder.encode(`{"type":"hello","seq":1,"protocol":"2.2","x":"${String.fromCharCode(0)}"}`),
        { code: 'protocol', reply_to: undefined },
      ],
    ];
    for (const [message, error] of cases) {
      const device = exampleDevice();
      const app = byHand(device);
      await app.send(message);
      const answer = json(await app.next());
      const { reply_to: replyTo, ...rest } = error as { reply_to?: number };
      expect(answer).toEqual(expect.objectContaining({ type: 'error', seq: 1, ...rest }));
      expect(answer.reply_to).toBe(replyTo);
      expect('reply_to' in answer).toBe(replyTo !== undefined);
      await app.next();
      expect(app.closed).toBe(true);
    }
  });

  test('a broken fragment ends the session, without an answer', async () => {
    const app = byHand(exampleDevice());
    await app.link.write(Uint8Array.of(0x40, 1));
    expect(await app.next()).toBeUndefined();
    expect(app.closed).toBe(true);
  });

  /** A hand-made exchange, up to the device's share: the app's prover's inputs. */
  async function shared(device: SimulatedDevice) {
    const app = byHand(device);
    await app.send(hello);
    const deviceHello = (await app.next())!;
    const { salt } = json(deviceHello);
    const secret = await stretch(encoder.encode(device.secret.code), checkedBase64url(salt));
    const contextBytes = context(hello, deviceHello);
    const prover = new Prover(contextBytes, secret, randomScalar(cryptoRandom));
    await app.send(encodeMessage({ type: 'share', seq: 2, share: base64url(prover.share) }));
    const answer = json(await app.next());
    const finished = prover.finish(
      checkedBase64url(answer.share),
      checkedBase64url(answer.confirm),
    );
    return { app, finished };
  }

  test('a wrong confirmation gets the error code, in the clear, and a new code', async () => {
    const device = exampleDevice();
    const first = device.secret;
    const { app, finished } = await shared(device);
    const wrong = Uint8Array.from(finished.confirmation);
    wrong[0] ^= 1;
    await app.send(encodeMessage({ type: 'confirm', seq: 3, confirm: base64url(wrong) }));
    expect(json(await app.next())).toEqual(
      expect.objectContaining({ type: 'error', seq: 3, reply_to: 3, code: 'code' }),
    );
    await app.next();
    expect(app.closed).toBe(true);
    expect(device.secret.code === first.code && device.secret.salt === first.salt).toBe(false);
  });

  test('after the exchange, the device answers only what it can open', async () => {
    const device = exampleDevice();
    const { app, finished } = await shared(device);
    const keys = sessionKeys(finished.shared);
    const channel = new Channel(keys.app, keys.device);
    await app.send(
      encodeMessage({ type: 'confirm', seq: 3, confirm: base64url(finished.confirmation) }),
    );
    await app.send(channel.seal(encodeMessage({ type: 'reboot', seq: 4 })));
    const unknown = decodeMessage(channel.open((await app.next())!), 'from_device');
    expect(unknown).toEqual(
      expect.objectContaining({ type: 'error', reply_to: 4, code: 'unknown' }),
    );
    await app.send(
      channel.seal(
        encodeMessage({ type: 'confirm', seq: 5, confirm: base64url(finished.confirmation) }),
      ),
    );
    const again = decodeMessage(channel.open((await app.next())!), 'from_device');
    expect(again).toEqual(
      expect.objectContaining({ type: 'error', reply_to: 5, code: 'protocol' }),
    );
    await app.next();
    expect(app.closed).toBe(true);
  });

  test('a message in the clear after the exchange ends the session', async () => {
    const device = exampleDevice();
    const first = device.secret;
    const { app, finished } = await shared(device);
    await app.send(
      encodeMessage({ type: 'confirm', seq: 3, confirm: base64url(finished.confirmation) }),
    );
    await app.send(encodeMessage({ type: 'info', seq: 4 }));
    // It cannot be decrypted, so it cannot be read: the error, sealed, replies to nothing, as
    // the robot's does.
    const keys = sessionKeys(finished.shared);
    const channel = new Channel(keys.app, keys.device);
    const error = decodeMessage(channel.open((await app.next())!), 'from_device');
    expect(error).toEqual(expect.objectContaining({ type: 'error', seq: 3, code: 'protocol' }));
    expect('reply_to' in error).toBe(false);
    await app.next();
    expect(app.closed).toBe(true);
    // Each code serves one attempt, as on the robot: a session that ends without `finish`, its
    // code confirmed, leaves a new one.
    expect(device.secret).not.toEqual(first);
  });

  test('an app that leaves while the device stretches the code costs that code', async () => {
    const device = exampleDevice();
    const first = device.secret;
    const app = byHand(device);
    await app.send(hello);
    const deviceHello = (await app.next())!;
    const secret = await stretch(
      encoder.encode(first.code),
      checkedBase64url(json(deviceHello).salt),
    );
    const prover = new Prover(context(hello, deviceHello), secret, randomScalar(cryptoRandom));
    await app.send(encodeMessage({ type: 'share', seq: 2, share: base64url(prover.share) }));
    // The device has taken the share, and stretches its code.
    await settle();
    await app.link.close();
    expect(device.secret).not.toEqual(first);
    // Once a whole session has run since, the first one has stretched its code too: it said
    // nothing more.
    const { session } = await (await greet(device.connect(), options)).exchange(device.secret.code);
    await session.close();
    expect(await app.next()).toBeUndefined();
  });

  test('a share that is no point is refused', async () => {
    const device = exampleDevice();
    const app = byHand(device);
    await app.send(hello);
    await app.next();
    await app.send(encodeMessage({ type: 'share', seq: 2, share: base64url(new Uint8Array(65)) }));
    expect(json(await app.next())).toEqual(
      expect.objectContaining({ code: 'protocol', reply_to: 2 }),
    );
  });

  test('a session that ends before its share keeps the code', async () => {
    const device = exampleDevice();
    const first = device.secret;
    const app = byHand(device);
    await app.send(hello);
    await app.next();
    await app.link.close();
    expect(device.secret).toBe(first);
  });
});

/** A link to a device that the test scripts: it hears each of the app's messages, joined. */
class FakeLink implements Link {
  readonly written: Uint8Array[] = [];
  private listener: LinkListener | null = null;
  private readonly joiner = new Joiner();
  ended = false;
  closes = 0;

  constructor(
    private readonly hear: (message: Uint8Array, link: FakeLink) => void | Promise<void>,
    readonly fragmentSize = 20,
    private readonly failWrites = false,
  ) {}

  async write(fragment: Uint8Array): Promise<void> {
    if (this.ended || this.failWrites) throw new Error('the link has ended');
    this.written.push(fragment);
    const message = this.joiner.add(fragment);
    if (message) await this.hear(message, this);
  }

  listen(listener: LinkListener): () => void {
    this.listener = listener;
    if (this.ended) listener.closed();
    return () => {
      this.listener = null;
    };
  }

  get listening(): boolean {
    return this.listener !== null;
  }

  async close(): Promise<void> {
    this.closes += 1;
    this.ended = true;
  }

  /** The device sends `bytes`, in fragments. */
  send(bytes: Uint8Array): void {
    for (const fragment of split(bytes, this.fragmentSize)) this.listener?.fragment(fragment);
  }

  sendJson(message: Record<string, unknown>): void {
    this.send(encoder.encode(JSON.stringify(message)));
  }

  /** The device indicates `fragment`, as it is. */
  raw(fragment: Uint8Array): void {
    this.listener?.fragment(fragment);
  }

  /** The device ends the link. */
  end(): void {
    this.listener?.closed();
  }

  /** The app's messages, joined, as written: those after the exchange encrypted. */
  messages(): Uint8Array[] {
    const joiner = new Joiner();
    return this.written
      .map((fragment) => joiner.add(fragment))
      .filter((message): message is Uint8Array => message !== null);
  }
}

const SALT = new Uint8Array(16).fill(9);
const DEVICE_HELLO = {
  type: 'hello',
  seq: 1,
  reply_to: 1,
  protocol: '2.0',
  discriminator: '3F7A',
  salt: base64url(SALT),
};

describe('a device that breaks set-up, over a fake link', () => {
  const lost = (operation: string, reason: string) => new SessionLost(operation, reason as never);

  test.each<[string, (link: FakeLink) => void, Error]>([
    [
      'an error to hello',
      (link) => link.sendJson({ type: 'error', seq: 1, reply_to: 1, code: 'busy', message: '' }),
      new DeviceRefused('hello', 'busy'),
    ],
    [
      'an error that answers nothing',
      (link) => link.sendJson({ type: 'error', seq: 1, code: 'version', message: '' }),
      new DeviceRefused('hello', 'version'),
    ],
    [
      'an error to a message never sent',
      (link) => link.sendJson({ type: 'error', seq: 1, reply_to: 2, code: 'busy', message: '' }),
      lost('hello', 'broken'),
    ],
    [
      'another major version',
      (link) => link.sendJson({ ...DEVICE_HELLO, protocol: '3.0' }),
      lost('hello', 'broken'),
    ],
    ['a wrong seq', (link) => link.sendJson({ ...DEVICE_HELLO, seq: 2 }), lost('hello', 'broken')],
    [
      'a wrong reply_to',
      (link) => link.sendJson({ ...DEVICE_HELLO, reply_to: 2 }),
      lost('hello', 'broken'),
    ],
    [
      'no reply_to',
      (link) => link.sendJson({ ...DEVICE_HELLO, reply_to: undefined }),
      lost('hello', 'broken'),
    ],
    [
      'another answer',
      (link) =>
        link.sendJson({
          type: 'share',
          seq: 1,
          reply_to: 1,
          share: base64url(new Uint8Array(65)),
          confirm: base64url(new Uint8Array(32)),
        }),
      lost('hello', 'broken'),
    ],
    ['no JSON', (link) => link.send(encoder.encode('hello')), lost('hello', 'broken')],
    ['a broken fragment', (link) => link.raw(Uint8Array.of(0x40, 1)), lost('hello', 'broken')],
    ['the end of the link', (link) => link.end(), lost('hello', 'ended')],
  ])('%s', async (_, answer, error) => {
    const link = new FakeLink((_message, fake) => answer(fake));
    await expect(greet(link, options)).rejects.toThrow(error);
    expect(link.ended).toBe(true);
  });

  test('a link that has ended, or whose writes fail, ends the session', async () => {
    const ended = new FakeLink(() => undefined);
    ended.ended = true;
    await expect(greet(ended, options)).rejects.toThrow(lost('hello', 'ended'));
    const failing = new FakeLink(() => undefined, 20, true);
    await expect(greet(failing, options)).rejects.toThrow(lost('hello', 'ended'));
    expect(failing.closes).toBe(1);
    expect([ended.listening, failing.listening]).toEqual([false, false]);
  });

  test('a link of fragments under 20 bytes is refused, and closed', async () => {
    const link = new FakeLink(() => undefined, 19);
    await expect(greet(link, options)).rejects.toThrow(
      new RangeError('a link writes at least 20 bytes at once'),
    );
    expect([link.closes, link.written.length]).toEqual([1, 0]);
    await expect(greet(new FakeLink(() => undefined, 20.5), options)).rejects.toThrow(RangeError);
  });

  test('no answer within answer_timeout ends the session', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      const link = new FakeLink(() => undefined);
      const greeting = greet(link, options);
      const settled = greeting.catch((error: unknown) => error);
      await settle();
      jest.advanceTimersByTime(settings.answer_timeout * 1000 - 1);
      await settle();
      expect(link.ended).toBe(false);
      jest.advanceTimersByTime(1);
      expect(await settled).toEqual(lost('hello', 'timeout'));
      expect(link.ended).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('a message that comes unasked ends the session', async () => {
    const link = new FakeLink((_message, fake) => fake.sendJson(DEVICE_HELLO));
    const greeting = await greet(link, options);
    link.sendJson({ type: 'info', seq: 2, reply_to: 1 });
    expect(link.ended).toBe(true);
    await expect(greeting.exchange('12345678')).rejects.toThrow(lost('share', 'broken'));
  });

  test('a fragment that comes unasked ends the session, before the app keeps it', async () => {
    const link = new FakeLink((_message, fake) => fake.sendJson(DEVICE_HELLO));
    const greeting = await greet(link, options);
    link.raw(Uint8Array.of(0x80, 0x20, 0x00, 1));
    expect(link.ended).toBe(true);
    await expect(greeting.exchange('12345678')).rejects.toThrow(lost('share', 'broken'));
  });

  /** A device that plays its side of the exchange with `code`, then `confirmed` once the app's
   * confirmation came: what it answers to the confirmation and to info. */
  function scripted(
    code: string,
    confirmed: (link: FakeLink, channel: Channel, seqs: number[]) => void,
  ) {
    let verifier: Verifier;
    let appHello: Uint8Array;
    let count = 0;
    let channel: Channel | null = null;
    return new FakeLink(async (bytes, link) => {
      count += 1;
      if (count === 1) {
        appHello = bytes;
        link.sendJson(DEVICE_HELLO);
      } else if (count === 2) {
        const helloBytes = encoder.encode(JSON.stringify(DEVICE_HELLO));
        const secret = await stretch(encoder.encode(code), SALT);
        verifier = new Verifier(
          context(appHello, helloBytes),
          secret.w0,
          record(secret.w1),
          randomScalar(cryptoRandom),
        );
        const share = JSON.parse(decoder.decode(bytes)).share;
        const answer = verifier.respond(checkedBase64url(share));
        link.sendJson({
          type: 'share',
          seq: 2,
          reply_to: 2,
          share: base64url(answer.share),
          confirm: base64url(answer.confirmation),
        });
      } else if (count === 3) {
        const confirm = JSON.parse(decoder.decode(bytes)).confirm;
        const keys = sessionKeys(verifier.finish(checkedBase64url(confirm)));
        channel = new Channel(keys.device, keys.app);
        confirmed(link, channel, [3]);
      } else if (channel) {
        confirmed(link, channel, [count]);
      }
    });
  }
  const CODE = '40917362';

  test('a device that answers info proves the exchange', async () => {
    const link = scripted(CODE, (fake, channel, [count]) => {
      if (count !== 4) return;
      const info = { ...fromDevice[2], seq: 3, reply_to: 4 };
      fake.send(channel.seal(encoder.encode(JSON.stringify(info))));
    });
    const greeting = await greet(link, options);
    expect(greeting.discriminator).toBe('3F7A');
    await expect(greeting.exchange('4091736')).rejects.toThrow(
      new RangeError('a code has 8 digits'),
    );
    const { info } = await greeting.exchange(CODE);
    expect(info).toEqual(answerFields(3));
    await expect(greeting.exchange(CODE)).rejects.toThrow('a session tries one code');
    expect(link.messages()).toHaveLength(4);
  });

  test('an error to the confirmation, in the clear, is the device refusing the code', async () => {
    const link = scripted(CODE, (fake, _channel, [count]) => {
      if (count === 3)
        fake.sendJson({ type: 'error', seq: 3, reply_to: 3, code: 'code', message: '' });
    });
    const greeting = await greet(link, options);
    await expect(greeting.exchange(CODE)).rejects.toThrow(new DeviceRefused('confirm', 'code'));
    // It came before info was written: info was not sent.
    expect(link.messages()).toHaveLength(3);
    expect(link.ended).toBe(true);
  });

  test.each<[string, (link: FakeLink, channel: Channel) => void]>([
    ['a message in the clear', (link) => link.sendJson({ ...fromDevice[2], seq: 3, reply_to: 4 })],
    [
      'an error in the clear to info',
      (link) => link.sendJson({ type: 'error', seq: 3, reply_to: 4, code: 'code', message: '' }),
    ],
    [
      'an error in the clear with no reply_to',
      (link) => link.sendJson({ type: 'error', seq: 3, code: 'code', message: '' }),
    ],
    [
      'a message that does not decrypt',
      (link, channel) => {
        const sealed = channel.seal(
          encoder.encode(JSON.stringify({ ...fromDevice[2], seq: 3, reply_to: 4 })),
        );
        sealed[0] ^= 1;
        link.send(sealed);
      },
    ],
    [
      'a message that is no JSON, sealed',
      (link, channel) => link.send(channel.seal(encoder.encode('info'))),
    ],
  ])('%s after the exchange ends the session', async (_, answer) => {
    const link = scripted(CODE, (fake, channel, [count]) => {
      if (count === 4) answer(fake, channel);
    });
    const greeting = await greet(link, options);
    await expect(greeting.exchange(CODE)).rejects.toThrow(lost('info', 'broken'));
    expect(link.ended).toBe(true);
  });

  test('an error in the clear after an encrypted answer ends the session', async () => {
    const link = scripted(CODE, (fake, channel, [count]) => {
      if (count === 4) {
        fake.send(
          channel.seal(encoder.encode(JSON.stringify({ ...fromDevice[2], seq: 3, reply_to: 4 }))),
        );
      } else if (count === 5) {
        fake.sendJson({ type: 'error', seq: 4, reply_to: 3, code: 'code', message: '' });
      }
    });
    const { session } = await (await greet(link, options)).exchange(CODE);
    await expect(session.networks()).rejects.toThrow(lost('networks', 'broken'));
  });

  test('a share that is no point of P-256 ends the session', async () => {
    const link = new FakeLink((bytes, fake) => {
      const { seq } = JSON.parse(decoder.decode(bytes));
      if (seq === 1) fake.sendJson(DEVICE_HELLO);
      else
        fake.sendJson({
          type: 'share',
          seq: 2,
          reply_to: 2,
          share: base64url(new Uint8Array(65)),
          confirm: base64url(new Uint8Array(32)),
        });
    });
    const greeting = await greet(link, options);
    await expect(greeting.exchange(CODE)).rejects.toThrow(lost('share', 'broken'));
    expect(link.ended).toBe(true);
  });

  test('a message too long for set-up is not sent, and the session goes on', async () => {
    const challenge = 'q7Hn2xWf0cJm4Lr9Vb8sKt';
    const lengths: number[] = [];
    const link = scripted(CODE, (fake, channel, [count]) => {
      const answer = (message: Record<string, unknown>) =>
        fake.send(channel.seal(encoder.encode(JSON.stringify(message))));
      if (count === 4) answer({ ...fromDevice[2], seq: 3, reply_to: 4 });
      if (count === 5) {
        lengths.push(fake.messages()[4].length);
        answer({ type: 'error', seq: 4, reply_to: 5, code: 'server', message: '' });
      }
    });
    const { session } = await (await greet(link, options)).exchange(CODE);
    // A register message, sealed, of exactly `total` bytes: its server padded with characters
    // of 4 bytes, then of 1.
    const server = (total: number) => {
      const base = encodeMessage({ type: 'register', seq: 5, challenge, server: 'https://' });
      const room = total - 16 - base.length;
      return `https://${'😀'.repeat(Math.floor(room / 4))}${'a'.repeat(room % 4)}`;
    };
    await expect(session.register(challenge, server(8193))).rejects.toThrow(
      new RangeError('register: a message has at most 8192 bytes'),
    );
    await expect(session.register(challenge, server(8192))).rejects.toThrow(
      new DeviceRefused('register', 'server'),
    );
    expect(lengths).toEqual([8192]);
  });

  test('a message after the one that opens the channel leaves room for its tag', async () => {
    // Only `info`, which is short, follows the confirmation in a session: the conversation is
    // asked here with a long message after it.
    const lengths: number[] = [];
    const link = new FakeLink((message, fake) => {
      lengths.push(message.length);
      if (lengths.length === 2) fake.end();
    });
    const conversation = new Conversation(link, settings);
    const confirm = {
      type: 'confirm',
      fields: { confirm: base64url(new Uint8Array(32)) },
      then: new Channel(new Uint8Array(16), new Uint8Array(16).fill(1)),
    };
    const challenge = 'q7Hn2xWf0cJm4Lr9Vb8sKt';
    // A register message numbered 2, sealed, of exactly `total` bytes.
    const register = (total: number) => {
      const base = encodeMessage({ type: 'register', seq: 2, challenge, server: 'https://' });
      const room = total - 16 - base.length;
      const server = `https://${'😀'.repeat(Math.floor(room / 4))}${'a'.repeat(room % 4)}`;
      return { type: 'register', fields: { challenge, server } };
    };
    await expect(
      conversation.ask('register', [confirm, register(8193)], 'registration'),
    ).rejects.toThrow(new RangeError('register: a message has at most 8192 bytes'));
    expect(link.written).toHaveLength(0);
    await expect(
      conversation.ask('register', [confirm, register(8192)], 'registration'),
    ).rejects.toThrow(new SessionLost('register', 'ended'));
    expect(lengths[1]).toBe(8192);
  });

  test('an error to the share is the device refusing it', async () => {
    const link = new FakeLink((bytes, fake) => {
      const { seq } = JSON.parse(decoder.decode(bytes));
      if (seq === 1) fake.sendJson(DEVICE_HELLO);
      else fake.sendJson({ type: 'error', seq: 2, reply_to: 2, code: 'protocol', message: '' });
    });
    const greeting = await greet(link, options);
    await expect(greeting.exchange(CODE)).rejects.toThrow(new DeviceRefused('share', 'protocol'));
  });
});

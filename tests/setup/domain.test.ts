// SPDX-License-Identifier: MIT
// Set-up's fragments, its messages, and the code a device shows (platform/protocols/setup/README.md).
import { checkedBase64url } from '@/src/shared/bytes';
import { ProtocolError } from '@/src/shared/protocols';
import { readDiscriminator, readSetupString, readTypedCode } from '@/src/setup/domain/code';
import { DeviceRefused, NotConfirmed, SessionLost } from '@/src/setup/domain/errors';
import { FragmentError, Joiner, split } from '@/src/setup/domain/fragments';
import { decodeMessage, encodeMessage, readMessage, seqOf } from '@/src/setup/domain/messages';
import { major, MAX_FRAGMENT } from '@/src/setup/domain/protocol';

const bytes = (count: number) => Uint8Array.from({ length: count }, (_, index) => index % 251);

describe('fragments', () => {
  test('a message fits in one fragment when it can', () => {
    expect(split(bytes(17), 20)).toEqual([Uint8Array.of(0xc0, 0, 17, ...bytes(17))]);
  });

  test('a longer message takes continuations, each full but the last', () => {
    const message = bytes(60);
    const fragments = split(message, 20);
    expect(fragments.map((fragment) => fragment.length)).toEqual([20, 20, 20, 6]);
    expect(fragments.map((fragment) => fragment[0])).toEqual([0x80, 0, 0, 0x40]);
    expect([fragments[0][1], fragments[0][2]]).toEqual([0, 60]);
    expect(Array.from(fragments[0].subarray(3))).toEqual(Array.from(message.subarray(0, 17)));
    expect(Array.from(fragments[1].subarray(1))).toEqual(Array.from(message.subarray(17, 36)));
    const joiner = new Joiner();
    expect(fragments.slice(0, 3).map((fragment) => joiner.add(fragment))).toEqual([
      null,
      null,
      null,
    ]);
    expect(joiner.add(fragments[3])).toEqual(message);
  });

  test('the largest message, at a larger size, round-trips; then the next one', () => {
    const message = bytes(8192);
    const fragments = split(message, 244);
    expect([fragments[0][1], fragments[0][2]]).toEqual([0x20, 0x00]);
    const joiner = new Joiner();
    const joined = fragments.map((fragment) => joiner.add(fragment));
    expect(joined[joined.length - 1]).toEqual(message);
    expect(joiner.add(split(bytes(3), 20)[0])).toEqual(bytes(3));
  });

  test('a fragment holds 512 bytes at most, whatever room the link has', () => {
    // Android 14 asks for an ATT MTU of 517, which leaves 514 (set-up 2.2, The Bluetooth service).
    expect(MAX_FRAGMENT).toBe(512);
    const message = bytes(1500);
    for (const size of [514, 4096]) {
      const fragments = split(message, size);
      expect(fragments.map((fragment) => fragment.length)).toEqual([512, 512, 481]);
      const joiner = new Joiner();
      expect(fragments.map((fragment) => joiner.add(fragment)).pop()).toEqual(message);
    }
    expect(split(message, 511).map((fragment) => fragment.length)).toEqual([511, 511, 483]);
  });

  test('a message of no byte, or too many, and a fragment too small, are refused', () => {
    expect(() => split(new Uint8Array(0), 20)).toThrow(
      new RangeError('a message has 1 to 8192 bytes'),
    );
    expect(() => split(bytes(8193), 20)).toThrow(RangeError);
    expect(split(bytes(1), 20)).toHaveLength(1);
    expect(() => split(bytes(10), 19)).toThrow(
      new RangeError('a fragment has room for at least 20 bytes'),
    );
    expect(() => split(bytes(10), 20.5)).toThrow(RangeError);
  });

  test.each([
    ['an empty fragment', [Uint8Array.of()], 'a fragment has unknown flags'],
    ['unknown flags', [Uint8Array.of(0xc1, 0, 1, 7)], 'a fragment has unknown flags'],
    ['another flag', [Uint8Array.of(0x20, 0, 1, 7)], 'a fragment has unknown flags'],
    [
      'a first fragment within a message',
      [Uint8Array.of(0x80, 0, 5, 1), Uint8Array.of(0x80, 0, 1, 1)],
      'a first fragment came within a message',
    ],
    [
      'a first fragment with no length',
      [Uint8Array.of(0xc0, 0)],
      'a first fragment is too short for the length',
    ],
    ['a length of 0', [Uint8Array.of(0xc0, 0, 0)], 'a message has 1 to 8192 bytes'],
    [
      'a length past the limit',
      [Uint8Array.of(0xc0, 0x20, 0x01, 1)],
      'a message has 1 to 8192 bytes',
    ],
    [
      'a continuation with no first fragment',
      [Uint8Array.of(0x40, 1)],
      'a fragment came with no first one',
    ],
    [
      'more bytes than announced',
      [Uint8Array.of(0x80, 0, 2, 1), Uint8Array.of(0, 2, 3)],
      'a message is longer than its length',
    ],
    [
      'fewer bytes than announced',
      [Uint8Array.of(0xc0, 0, 3, 1, 2)],
      'a message is shorter than its length',
    ],
  ])('%s ends the session', (_, fragments, reason) => {
    const joiner = new Joiner();
    const last = fragments.pop()!;
    for (const fragment of fragments) joiner.add(fragment);
    expect(() => joiner.add(last)).toThrow(new FragmentError(reason));
  });

  test('continuations without data add nothing', () => {
    const joiner = new Joiner();
    expect(joiner.add(Uint8Array.of(0x80, 0, 2, 7))).toBeNull();
    for (let count = 0; count < 1000; count++) expect(joiner.add(Uint8Array.of(0))).toBeNull();
    expect(joiner.add(Uint8Array.of(0x40, 8))).toEqual(Uint8Array.of(7, 8));
  });

  test('a length of 8192 is let in', () => {
    const joiner = new Joiner();
    expect(joiner.add(Uint8Array.of(0x80, 0x20, 0x00, 1))).toBeNull();
  });
});

describe('messages', () => {
  test('a message is its JSON in UTF-8', () => {
    const encoded = encodeMessage({ type: 'join', seq: 6, ssid: 'Café' });
    expect(new TextDecoder().decode(encoded)).toBe('{"type":"join","seq":6,"ssid":"Café"}');
    expect(decodeMessage(encoded, 'from_app')).toEqual({ type: 'join', seq: 6, ssid: 'Café' });
  });

  test('a message that is no JSON in UTF-8, or breaks the schema, is refused', () => {
    // A byte that is no UTF-8, in a string: a decoder that repairs it gives a message that the
    // schema lets in, with U+FFFD in place of the byte.
    const notUtf8 = Uint8Array.of(
      ...new TextEncoder().encode('{"type":"error","seq":1,"code":"busy","message":"'),
      0xff,
      ...new TextEncoder().encode('"}'),
    );
    expect(JSON.parse(new TextDecoder().decode(notUtf8)).message).toBe(
      String.fromCodePoint(0xfffd),
    );
    expect(() => decodeMessage(notUtf8, 'from_device')).toThrow(ProtocolError);
    expect(() => decodeMessage(new TextEncoder().encode('{"type":'), 'from_device')).toThrow(
      ProtocolError,
    );
    const share = encodeMessage({ type: 'share', seq: 2, reply_to: 2, share: 'short' });
    expect(() => decodeMessage(share, 'from_device')).toThrow(ProtocolError);
    expect(() => decodeMessage(encodeMessage({ type: 'join', seq: 1 }), 'from_app')).toThrow(
      ProtocolError,
    );
  });

  test('a message that no side can hold, or with a byte order mark, cannot be read', () => {
    const utf8 = (text: string) => new TextEncoder().encode(text);
    const nul = `{"type":"join","seq":1,"ssid":"a${String.fromCharCode(0x5c)}u0000b"}`;
    expect(() => readMessage(utf8(nul), 'from_app')).toThrow(
      new ProtocolError('from_app', '/', 'holds a U+0000 or a lone surrogate'),
    );
    const deep = `{"type":"info","seq":1,"x":${'['.repeat(64)}${']'.repeat(64)}}`;
    expect(() => decodeMessage(utf8(deep), 'from_app')).toThrow(
      new ProtocolError('from_app', '/', 'nests deeper than 64'),
    );
    const marked = Uint8Array.of(0xef, 0xbb, 0xbf, ...utf8('{"type":"info","seq":1}'));
    expect(() => readMessage(marked, 'from_app')).toThrow(
      new ProtocolError('from_app', '/', 'is not JSON'),
    );
    expect(() => readMessage(Uint8Array.of(0xff), 'from_device')).toThrow(
      new ProtocolError('from_device', '/', 'is not UTF-8'),
    );
  });

  test('a seq can be read from an object that has one, even if it breaks the schema', () => {
    expect(seqOf({ type: 'nothing', seq: 7 })).toBe(7);
    expect(seqOf({ seq: 1 })).toBe(1);
    for (const value of [null, 7, [7], {}, { seq: 0 }, { seq: 1.5 }, { seq: '1' }]) {
      expect(seqOf(value)).toBeUndefined();
    }
  });
});

describe('the code', () => {
  test('a set-up string gives the discriminator and the code', () => {
    expect(readSetupString('setup:2:3F7A:40917362')).toEqual({
      kind: 'code',
      discriminator: '3F7A',
      code: '40917362',
    });
  });

  test('a set-up string of another major version names it', () => {
    expect(readSetupString('setup:3:anything')).toEqual({ kind: 'version', version: '3' });
    expect(readSetupString('setup:10')).toEqual({ kind: 'version', version: '10' });
  });

  test.each([
    'https://example.com',
    'setup:',
    'setup:x:3F7A:40917362',
    'setup:2',
    'setup:2:3f7a:40917362',
    'setup:2:3F7:40917362',
    'setup:2:3F7A:4091736',
    'setup:2:3F7A:409173621',
    'setup:2:3F7A:40917362:more',
    ' setup:2:3F7A:40917362',
    'SETUP:2:3F7A:40917362',
  ])('%j is no set-up string', (text) => {
    expect(readSetupString(text)).toBeNull();
  });

  test('a typed code takes spaces anywhere, and 8 digits', () => {
    expect(readTypedCode('4091 7362')).toBe('40917362');
    expect(readTypedCode(' 40917362 ')).toBe('40917362');
    expect(readTypedCode('4091-7362')).toBeNull();
    expect(readTypedCode('4091736')).toBeNull();
    expect(readTypedCode('409173621')).toBeNull();
  });

  test('a typed discriminator is 4 hexadecimal digits, in either case', () => {
    expect(readDiscriminator(' 3f7a ')).toBe('3F7A');
    expect(readDiscriminator('3F7')).toBeNull();
    expect(readDiscriminator('3F7AB')).toBeNull();
    expect(readDiscriminator('3G7A')).toBeNull();
  });

  test('a version names its major', () => {
    expect(major('2.0')).toBe('2');
    expect(major('12.3')).toBe('12');
  });
});

describe('errors', () => {
  test('each names what failed, never a value', () => {
    const refused = new DeviceRefused('join', 'wrong_password');
    expect([
      refused.message,
      refused.name,
      refused.is('wrong_password'),
      refused.is('network'),
    ]).toEqual(['join: the device answered wrong_password', 'DeviceRefused', true, false]);
    expect([new NotConfirmed().message, new NotConfirmed().name]).toEqual([
      'share: the device did not confirm the code',
      'NotConfirmed',
    ]);
    const lost = new SessionLost('info', 'timeout');
    expect([lost.message, lost.name]).toEqual([
      'info: the session is over (timeout)',
      'SessionLost',
    ]);
    expect(new FragmentError('a').name).toBe('FragmentError');
  });

  test('a field the schema let through is base64url', () => {
    expect(checkedBase64url('AQI')).toEqual(Uint8Array.of(1, 2));
    expect(() => checkedBase64url('A')).toThrow(new TypeError('a checked field is not base64url'));
  });
});

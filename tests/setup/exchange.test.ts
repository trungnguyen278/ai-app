// SPDX-License-Identifier: MIT
// SPAKE2+ and the session's keys, against RFC 9383's test vector and ai-platform's example of a
// whole set-up (platform/protocols/setup/examples/session.json), byte for byte.
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, bytesToNumberBE, hexToBytes, numberToBytesBE } from '@noble/curves/utils.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { base64url, fromBase64url } from '@/src/shared/bytes';
import { Channel, context, nonce, SealError, sessionKeys } from '@/src/setup/domain/channel';
import {
  decodePoint,
  ExchangeError,
  Prover,
  randomScalar,
  record,
  stretch,
  Verifier,
} from '@/src/setup/domain/spake2plus';

import vector from './rfc9383.json';

const encoder = new TextEncoder();
/** M and N for P-256 (RFC 9383, 4). */
const M = '02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f';
const N = '03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49';
const example = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'platform', 'protocols', 'setup', 'examples', 'session.json'),
    'utf8',
  ),
);
const exchange = example.exchange;
const sent = (type: string) =>
  example.messages.find(
    (entry: { from: string; message: { type: string } }) =>
      entry.from !== 'device' && entry.message.type === type,
  ).message;
const answered = (type: string) =>
  example.messages.find(
    (entry: { from: string; message: { type: string } }) =>
      entry.from === 'device' && entry.message.type === type,
  ).message;

const hex = (bytes: Uint8Array) => bytesToHex(bytes);
const scalar = (text: string) => bytesToNumberBE(hexToBytes(text));
/** A source of randomness that gives `value` as the scalar that `randomScalar` draws. */
const giving = (value: bigint) => () => numberToBytesBE(value - 1n, 48);

describe('RFC 9383, Appendix C', () => {
  const identities = {
    prover: encoder.encode(vector.idProver),
    verifier: encoder.encode(vector.idVerifier),
  };
  const secret = { w0: scalar(vector.w0), w1: scalar(vector.w1) };
  const prover = new Prover(encoder.encode(vector.Context), secret, scalar(vector.x), identities);
  const verifier = new Verifier(
    encoder.encode(vector.Context),
    secret.w0,
    hexToBytes(vector.L),
    scalar(vector.y),
    identities,
  );

  test('both sides make the vector', () => {
    expect(hex(record(secret.w1))).toBe(vector.L);
    expect(hex(prover.share)).toBe(vector.shareP);
    const answer = verifier.respond(prover.share);
    expect(hex(answer.share)).toBe(vector.shareV);
    expect(hex(answer.confirmation)).toBe(vector['HMAC(K_confirmV, shareP)']);
    const finished = prover.finish(answer.share, answer.confirmation);
    expect(hex(finished.confirmation)).toBe(vector['HMAC(K_confirmP, shareV)']);
    expect(hex(finished.shared)).toBe(vector.K_shared);
    expect(hex(verifier.finish(finished.confirmation))).toBe(vector.K_shared);
  });
});

describe('the example of a whole set-up', () => {
  test('the code and the salt give w0 and w1', async () => {
    const secret = await stretch(encoder.encode(exchange.code), fromBase64url(exchange.salt)!);
    expect(numberToBytesBE(secret.w0, 32)).toEqual(hexToBytes(exchange.w0));
    expect(numberToBytesBE(secret.w1, 32)).toEqual(hexToBytes(exchange.w1));
  });

  test('the hellos give the context', () => {
    const bytes = context(
      encoder.encode(exchange.app_hello),
      encoder.encode(exchange.device_hello),
    );
    expect(hex(bytes)).toBe(exchange.context);
  });

  test('both sides make its shares, confirmations and keys', () => {
    const secret = { w0: scalar(exchange.w0), w1: scalar(exchange.w1) };
    const contextBytes = hexToBytes(exchange.context);
    const prover = new Prover(contextBytes, secret, randomScalar(giving(scalar(exchange.x))));
    expect(base64url(prover.share)).toBe(sent('share').share);
    const verifier = new Verifier(
      contextBytes,
      secret.w0,
      record(secret.w1),
      randomScalar(giving(scalar(exchange.y))),
    );
    const answer = verifier.respond(prover.share);
    expect(base64url(answer.share)).toBe(answered('share').share);
    expect(base64url(answer.confirmation)).toBe(answered('share').confirm);
    const finished = prover.finish(answer.share, answer.confirmation);
    expect(base64url(finished.confirmation)).toBe(sent('confirm').confirm);
    const keys = sessionKeys(finished.shared);
    expect([hex(keys.app), hex(keys.device)]).toEqual([exchange.app_key, exchange.device_key]);
    const channel = new Channel(keys.app, keys.device);
    const first = channel.seal(encoder.encode('{"type": "info", "seq": 4}'));
    expect(base64url(first)).toBe(exchange.first_encrypted);
  });
});

describe('a wrong exchange', () => {
  const secret = { w0: 5n, w1: 7n };
  const other = { w0: 6n, w1: 7n };
  const context = encoder.encode('context');

  test('a wrong code fails both confirmations', () => {
    const prover = new Prover(context, secret, 11n);
    const verifier = new Verifier(context, other.w0, record(other.w1), 13n);
    const answer = verifier.respond(prover.share);
    expect(() => prover.finish(answer.share, answer.confirmation)).toThrow(
      new ExchangeError('confirmation', 'the confirmation is wrong'),
    );
    const honest = new Prover(context, other, 11n);
    const right = new Verifier(context, other.w0, record(other.w1), 13n);
    const shares = right.respond(honest.share);
    const { confirmation } = honest.finish(shares.share, shares.confirmation);
    expect(() => verifier.finish(confirmation)).toThrow('the confirmation is wrong');
    expect(right.finish(confirmation)).toEqual(
      honest.finish(shares.share, shares.confirmation).shared,
    );
  });

  test('a verifier confirms nothing before a share', () => {
    const verifier = new Verifier(context, secret.w0, record(secret.w1), 13n);
    expect(() => verifier.finish(new Uint8Array(32))).toThrow(
      expect.objectContaining({ kind: 'confirmation', message: 'no share to confirm' }),
    );
  });

  test('a share must be a point of P-256, uncompressed', () => {
    const prover = new Prover(context, secret, 11n);
    const compressed = decodePoint(prover.share).toBytes(true);
    const notOnCurve = Uint8Array.from(prover.share);
    notOnCurve[64] ^= 1;
    const tag = new Uint8Array(32);
    const cases: [Uint8Array, string][] = [
      [compressed, 'a share is not an uncompressed point'],
      [Uint8Array.of(0x05, ...prover.share.subarray(1)), 'a share is not an uncompressed point'],
      [prover.share.subarray(0, 64), 'a share is not an uncompressed point'],
      [notOnCurve, 'a share is not a point of P-256'],
    ];
    for (const [share, reason] of cases) {
      expect(() => prover.finish(share, tag)).toThrow(
        expect.objectContaining({ kind: 'share', message: reason }),
      );
    }
  });

  test('a share that gives the point at infinity is refused', () => {
    // With w0 = 1, shareV = N makes shareV − w0·N the point at infinity, and shareP = M makes
    // shareP − w0·M so (RFC 9383, 4).
    const point = (compressed: string) => p256.Point.fromHex(compressed).toBytes(false);
    const one = { w0: 1n, w1: 1n };
    const reason = 'the exchange gave the point at infinity';
    expect(() => new Prover(context, one, 11n).finish(point(N), new Uint8Array(32))).toThrow(
      expect.objectContaining({ kind: 'share', message: reason }),
    );
    expect(() => new Verifier(context, 1n, record(1n), 13n).respond(point(M))).toThrow(
      expect.objectContaining({ kind: 'share', message: reason }),
    );
  });
});

describe('the random scalar', () => {
  test('comes from 48 bytes, from 1 to the order minus 1', () => {
    const counts: number[] = [];
    const random = (count: number) => {
      counts.push(count);
      return new Uint8Array(count);
    };
    expect(randomScalar(random)).toBe(1n);
    expect(counts).toEqual([48]);
    expect(randomScalar(giving(12345n))).toBe(12345n);
  });
});

describe('the channel', () => {
  const app = new Uint8Array(16).fill(1);
  const device = new Uint8Array(16).fill(2);

  test('each side opens what the other sealed, in order', () => {
    const phone = new Channel(app, device);
    const robot = new Channel(device, app);
    const first = phone.seal(encoder.encode('one'));
    const second = phone.seal(encoder.encode('two'));
    expect(first).toHaveLength(3 + 16);
    expect(new TextDecoder().decode(robot.open(first))).toBe('one');
    expect(new TextDecoder().decode(robot.open(second))).toBe('two');
    expect(phone.open(robot.seal(encoder.encode('three')))).toEqual(encoder.encode('three'));
  });

  test('a message out of order, altered, or under the wrong key does not open', () => {
    const phone = new Channel(app, device);
    const first = phone.seal(encoder.encode('one'));
    const second = phone.seal(encoder.encode('two'));
    expect(() => new Channel(device, app).open(second)).toThrow(SealError);
    const altered = Uint8Array.from(first);
    altered[0] ^= 1;
    expect(() => new Channel(device, app).open(altered)).toThrow('a message does not decrypt');
    expect(() => new Channel(device, device).open(first)).toThrow(SealError);
    const robot = new Channel(device, app);
    expect(() => robot.open(altered)).toThrow(SealError);
    // A message that did not open does not count.
    expect(robot.open(first)).toEqual(encoder.encode('one'));
  });

  test('the nonce is 4 zero bytes, then the counter on 8 bytes, big-endian', () => {
    expect(hex(nonce(0))).toBe('000000000000000000000000');
    expect(hex(nonce(258))).toBe('000000000000000000000102');
    expect(hex(nonce(2 ** 32 + 5))).toBe('000000000000000100000005');
    expect(hex(nonce(2 ** 53 - 1))).toBe('00000000001fffffffffffff');
  });
});

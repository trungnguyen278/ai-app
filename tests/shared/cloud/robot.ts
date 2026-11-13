// SPDX-License-Identifier: MIT
// A robot of the tests' own, for the simulated cloud: a key of its own, the registrations it
// signs with it as set-up says (platform/protocols/setup/README.md, The registration), and
// what its hello says it is.
import { p256 } from '@noble/curves/nist.js';

import { base64url } from '@/src/shared/bytes';
import type { DeviceDescription, PublicJwk } from '@/src/shared/cloud';

type Fields = Record<string, unknown>;

/** What the robot of ai-platform's examples says it is (examples/devices.json). */
export const HELLO: DeviceDescription = { kind: 'robot', model: 'concept-v0', software: '0.4.0' };

export class Robot {
  readonly key: PublicJwk;
  private readonly secret = p256.utils.randomSecretKey();
  private registrations = 0;

  constructor(readonly id: string) {
    const point = p256.getPublicKey(this.secret, false);
    this.key = {
      kty: 'EC',
      crv: 'P-256',
      x: base64url(point.subarray(1, 33)),
      y: base64url(point.subarray(33)),
    };
  }

  /** Its registration for `challenge` and `server`, with the header and the claims that a
   *  test changes: a field set to `undefined` is left out. */
  register(
    challenge: string,
    server: string,
    change: { header?: Fields; claims?: Fields } = {},
  ): string {
    this.registrations += 1;
    const header = {
      alg: 'ES256',
      jwk: this.key,
      typ: 'device-registration+jwt',
      ...change.header,
    };
    const claims = {
      iss: this.id,
      sub: this.id,
      aud: server,
      nonce: challenge,
      jti: `registration-${this.registrations}`,
      ...change.claims,
    };
    return this.sign(header, claims);
  }

  /** A JWT of `header` and `claims`, signed with ES256 by the robot's key (RFC 7515): an
   *  object as JSON, a text as it is. */
  sign(header: Fields | string, claims: Fields | string): string {
    const encoder = new TextEncoder();
    const signed = `${part(header)}.${part(claims)}`;
    return `${signed}.${base64url(p256.sign(encoder.encode(signed), this.secret))}`;
  }
}

/** `registration` with the other s of its signature, n - s, which verifies as well (RFC 7518,
 *  3.4, sets no rule on s): noble signs with the low one. */
export function withHighS(registration: string): string {
  const [header, claims, signature] = registration.split('.');
  const bytes = Uint8Array.from(Buffer.from(signature, 'base64url'));
  const s = BigInt(`0x${Buffer.from(bytes.subarray(32)).toString('hex')}`);
  const high = (p256.Point.Fn.ORDER - s).toString(16).padStart(64, '0');
  bytes.set(Buffer.from(high, 'hex'), 32);
  return `${header}.${claims}.${base64url(bytes)}`;
}

function part(fields: Fields | string): string {
  const text = typeof fields === 'string' ? fields : JSON.stringify(fields);
  return base64url(new TextEncoder().encode(text));
}

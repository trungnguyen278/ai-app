// SPDX-License-Identifier: MIT
// A device's registration, as the simulated cloud verifies it, as ai-cloud does (its
// devices/domain/registration.py and shared/jose.py): the JWT that the device signs at set-up
// with its key, which it carries (platform/protocols/setup/README.md, The registration). The
// cloud reads its challenge first, to use it whatever follows, then verifies the rest. Errors
// say which check failed, never what the registration holds.
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { base64url, fromBase64url } from '@/src/shared/bytes';
import { JsonError, readJson } from '@/src/shared/protocols';

import { uuid } from './model';

// Fixed by set-up (platform/protocols/setup/README.md, The registration): its type, and the
// claims it carries.
const REGISTRATION_TYPE = 'device-registration+jwt';
const REQUIRED_CLAIMS = ['iss', 'sub', 'aud', 'nonce'] as const;
// Fixed by JWA (RFC 7518): ES256 (3.4), whose signature is r and s, 32 bytes each, and the
// P-256 key that verifies it (6.2.1).
const ALGORITHM = 'ES256';
const KEY_TYPE = 'EC';
const CURVE = 'P-256';
const COORDINATE_BYTES = 32;
// SEC 1, version 2 (2.3.3): an uncompressed point is 4, then its coordinates.
const UNCOMPRESSED = 0x04;

/** A P-256 public key as a JWK, with its required members only (RFC 7638, 3.2). */
export interface PublicJwk {
  kty: string;
  crv: string;
  x: string;
  y: string;
}

/** Who a registration says the device is, and the thumbprint of its key. */
export interface Registration {
  /** In lower case, as the cloud writes identifiers. */
  deviceId: string;
  key: string;
}

/** A registration that does not verify; its message says which check failed. */
export class RegistrationInvalid extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'RegistrationInvalid';
  }
}

/** The challenge a registration names, its nonce, before anything is verified; `null` if it
 *  names none. */
export function challengeOf(registration: string): string | null {
  const parts = registration.split('.');
  if (parts.length !== 3 || readPart(parts[0]) === null) return null;
  const nonce = readPart(parts[1])?.nonce;
  return typeof nonce === 'string' ? nonce : null;
}

/**
 * Who the device is, and its key, once the registration's type, key, signature, audience and
 * identifiers are checked: `RegistrationInvalid` otherwise. Its challenge is the caller's to
 * check, as `challengeOf` reads it. No times: before it first connects, the device's clock may
 * not be set, and the challenge makes the registration fresh.
 */
export function verifyRegistration(registration: string, audience: string): Registration {
  const parts = registration.split('.');
  const header = parts.length === 3 ? readPart(parts[0]) : null;
  if (header === null) throw new RegistrationInvalid('malformed');
  // Explicit typing (RFC 8725, 3.11): no other JWT passes for a registration.
  if (header.typ !== REGISTRATION_TYPE)
    throw new RegistrationInvalid("not a device's registration");
  const jwk = publicJwk(header.jwk);
  if (header.alg !== ALGORITHM) throw new RegistrationInvalid('not ES256');
  if (!signatureVerifies(parts, jwk)) throw new RegistrationInvalid('bad signature');
  const claims = readPart(parts[1]);
  if (claims === null) throw new RegistrationInvalid('malformed');
  for (const claim of REQUIRED_CLAIMS) {
    if (claims[claim] === undefined || claims[claim] === null) {
      throw new RegistrationInvalid(`no ${claim} claim`);
    }
  }
  if (claims.aud !== audience) throw new RegistrationInvalid('wrong audience');
  const issuer = typeof claims.iss === 'string' ? uuid(claims.iss) : null;
  const subject = typeof claims.sub === 'string' ? uuid(claims.sub) : null;
  if (issuer === null || subject === null) {
    throw new RegistrationInvalid('iss and sub are not identifiers');
  }
  if (issuer !== subject) throw new RegistrationInvalid('iss and sub differ');
  return { deviceId: subject, key: thumbprint(jwk) };
}

/** The thumbprint of a P-256 JWK (RFC 7638, 3.2): the SHA-256 of its required members, in
 *  lexicographic order and without spaces, in base64url. */
export function thumbprint(jwk: PublicJwk): string {
  const members = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
  return base64url(sha256(new TextEncoder().encode(JSON.stringify(members))));
}

/**
 * The P-256 public key that `jwk` holds, with its required members only: `RegistrationInvalid`
 * for anything else, such as another kind of key, a private one, or coordinates that are not a
 * point of the curve, each written in one way only, so that one key has one thumbprint.
 */
function publicJwk(jwk: unknown): PublicJwk {
  if (typeof jwk !== 'object' || jwk === null || Array.isArray(jwk)) {
    throw new RegistrationInvalid('its key: not a P-256 key');
  }
  const members = jwk as Record<string, unknown>;
  if (members.kty !== KEY_TYPE || members.crv !== CURVE) {
    throw new RegistrationInvalid('its key: not a P-256 key');
  }
  if ('d' in members) throw new RegistrationInvalid('its key: a private key');
  const { x, y } = members;
  if (typeof x !== 'string' || typeof y !== 'string') {
    throw new RegistrationInvalid('its key: no coordinates');
  }
  const key = { kty: KEY_TYPE, crv: CURVE, x, y };
  for (const coordinate of [x, y]) {
    const bytes = fromBase64url(coordinate);
    if (bytes === null || base64url(bytes) !== coordinate) {
      throw new RegistrationInvalid('its key: not base64url without padding');
    }
    if (bytes.length !== COORDINATE_BYTES) {
      throw new RegistrationInvalid('its key: coordinates of the wrong size');
    }
  }
  try {
    p256.Point.fromBytes(pointOf(key)).assertValidity();
  } catch {
    throw new RegistrationInvalid('its key: not a point of the curve');
  }
  return key;
}

/** Whether the JWT's signature is its key's, over its header and claims (RFC 7515, 5.2). */
function signatureVerifies(parts: string[], jwk: PublicJwk): boolean {
  const signature = fromBase64url(parts[2]);
  if (signature === null || signature.length !== 2 * COORDINATE_BYTES) return false;
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  try {
    // JWS takes either s of a signature (RFC 7518, 3.4), as ai-cloud's cryptography does:
    // noble takes the low one only, unless told.
    return p256.verify(signature, signed, pointOf(jwk), { lowS: false });
  } catch {
    // r or s out of range.
    return false;
  }
}

/** The key's point, uncompressed (SEC 1, 2.3.3). */
function pointOf(jwk: PublicJwk): Uint8Array {
  const x = fromBase64url(jwk.x) ?? new Uint8Array();
  const y = fromBase64url(jwk.y) ?? new Uint8Array();
  const point = new Uint8Array(1 + x.length + y.length);
  point[0] = UNCOMPRESSED;
  point.set(x, 1);
  point.set(y, 1 + x.length);
  return point;
}

/** A part of a JWT, as a JSON object; `null` if it is not one. */
function readPart(part: string): Record<string, unknown> | null {
  const bytes = fromBase64url(part);
  if (bytes === null) return null;
  let text: string;
  try {
    // A byte order mark is dropped, as ai-cloud's PyJWT drops it: it reads a part's bytes
    // with Python's json.loads, which takes UTF-8 with one (json.detect_encoding).
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Not UTF-8: the TypeError of the Encoding Standard (decode()), whose class need not be
    // this realm's, as under Jest.
    return null;
  }
  let value: unknown;
  try {
    value = readJson(text);
  } catch (error) {
    if (error instanceof JsonError) return null;
    throw error;
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

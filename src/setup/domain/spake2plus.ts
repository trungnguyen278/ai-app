// SPDX-License-Identifier: MIT
// SPAKE2+ (RFC 9383), with the ciphersuite P256-SHA256-HKDF-SHA256-HMAC-SHA256, as set-up 2.0
// runs it (platform/protocols/setup/README.md, SPAKE2+): the app is the Prover, and a device the
// Verifier. The cryptography is noble's (docs/decisions/0006-set-up-cryptography.md).
import { mapHashToField } from '@noble/curves/abstract/modular.js';
import { p256 } from '@noble/curves/nist.js';
import { bytesToNumberBE, equalBytes, numberToBytesBE } from '@noble/curves/utils.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { Random } from '@/src/shared/bytes';

const Point = p256.Point;
type P256Point = typeof p256.Point.BASE;

/** The order of P-256's group: scalars are taken modulo it. */
const ORDER = Point.Fn.ORDER;
/** Bytes in a scalar, or a coordinate. */
const SCALAR_BYTES = 32;
/** Bytes in a point, uncompressed (SEC1, 2.3.3): 0x04, then both coordinates. */
const POINT_BYTES = 1 + 2 * SCALAR_BYTES;
const UNCOMPRESSED = 0x04;
/** Random bytes for a uniform scalar, as FIPS 186-5, A.2.1 asks: 64 bits more than the order. */
const SCALAR_SEED = SCALAR_BYTES + 16;

/** M and N, for P-256 (RFC 9383, 4). */
const M = Point.fromHex('02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f');
const N = Point.fromHex('03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49');

/** scrypt's parameters (RFC 7914), as set-up fixes them: those RFC 9383, 3.2 recommends. */
const SCRYPT = { N: 32768, r: 8, p: 1 };
/** Bytes scrypt gives: w0 and w1, each 64 bits longer than a scalar (RFC 9383, 3.2). */
const HALF = 40;

/** RFC 9383, 3.4's labels for HKDF. */
const CONFIRMATION_KEYS = new TextEncoder().encode('ConfirmationKeys');
const SHARED_KEY = new TextEncoder().encode('SharedKey');
const HASH_BYTES = 32;

/** The exchange cannot go on: a share that is no point, or a confirmation that is wrong. */
export class ExchangeError extends Error {
  constructor(
    /** `share` for a share that breaks the exchange; `confirmation` for a wrong confirmation. */
    readonly kind: 'share' | 'confirmation',
    reason: string,
  ) {
    super(reason);
    this.name = 'ExchangeError';
  }
}

/** w0 and w1, from the code (RFC 9383, 3.2). */
export interface Secret {
  w0: bigint;
  w1: bigint;
}

/** RFC 9383's identities: set-up's are both empty (The session, SPAKE2+). */
export interface Identities {
  prover: Uint8Array;
  verifier: Uint8Array;
}
const NO_IDENTITIES: Identities = { prover: new Uint8Array(0), verifier: new Uint8Array(0) };

/** `len()` of RFC 9383: 8 bytes, little-endian. */
function length(count: number): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setUint32(0, count, true);
  return bytes;
}

/** Each part, after its `len()`. */
function framed(...parts: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + 8 + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(length(part.length), offset);
    bytes.set(part, offset + 8);
    offset += 8 + part.length;
  }
  return bytes;
}

/** The bytes a point is sent as: SEC1's uncompressed form. */
function encode(point: P256Point): Uint8Array {
  return point.toBytes(false);
}

/** The point that `bytes` give, checked to be on P-256 and not the point at infinity. */
export function decodePoint(bytes: Uint8Array): P256Point {
  if (bytes.length !== POINT_BYTES || bytes[0] !== UNCOMPRESSED) {
    throw new ExchangeError('share', 'a share is not an uncompressed point');
  }
  try {
    return Point.fromBytes(bytes);
  } catch {
    throw new ExchangeError('share', 'a share is not a point of P-256');
  }
}

/** w0 and w1 for `code`, the device's code in ASCII, and the device's `salt`: scrypt of the code
 * and the identities, cut in two, each reduced modulo the order (RFC 9383, 3.2). */
export async function stretch(
  code: Uint8Array,
  salt: Uint8Array,
  identities: Identities = NO_IDENTITIES,
): Promise<Secret> {
  const stretched = await scryptAsync(framed(code, identities.prover, identities.verifier), salt, {
    ...SCRYPT,
    dkLen: 2 * HALF,
  });
  return {
    w0: bytesToNumberBE(stretched.subarray(0, HALF)) % ORDER,
    w1: bytesToNumberBE(stretched.subarray(HALF)) % ORDER,
  };
}

/** L, which the Verifier keeps in place of w1 (RFC 9383, 3.2). */
export function record(w1: bigint): Uint8Array {
  return encode(Point.BASE.multiply(w1));
}

/** A scalar from 1 to the order minus 1, drawn from `random`. */
export function randomScalar(random: Random): bigint {
  return bytesToNumberBE(mapHashToField(random(SCALAR_SEED), ORDER));
}

/** The keys that the transcript gives (RFC 9383, 3.4). */
interface Keys {
  confirmProver: Uint8Array;
  confirmVerifier: Uint8Array;
  shared: Uint8Array;
}

function keys(transcript: Uint8Array): Keys {
  const main = sha256(transcript);
  const confirmation = hkdf(sha256, main, undefined, CONFIRMATION_KEYS, 2 * HASH_BYTES);
  return {
    confirmProver: confirmation.subarray(0, HASH_BYTES),
    confirmVerifier: confirmation.subarray(HASH_BYTES),
    shared: hkdf(sha256, main, undefined, SHARED_KEY, HASH_BYTES),
  };
}

/** TT, the transcript (RFC 9383, 3.3). */
function transcript(
  context: Uint8Array,
  identities: Identities,
  shareProver: Uint8Array,
  shareVerifier: Uint8Array,
  z: P256Point,
  v: P256Point,
  w0: bigint,
): Uint8Array {
  if (z.is0() || v.is0()) {
    throw new ExchangeError('share', 'the exchange gave the point at infinity');
  }
  return framed(
    context,
    identities.prover,
    identities.verifier,
    encode(M),
    encode(N),
    shareProver,
    shareVerifier,
    encode(z),
    encode(v),
    numberToBytesBE(w0, SCALAR_BYTES),
  );
}

/** The app's side: its share, then the Verifier's confirmation checked, and its own. */
export class Prover {
  /** shareP, X. */
  readonly share: Uint8Array;

  constructor(
    private readonly context: Uint8Array,
    private readonly secret: Secret,
    /** x, from 1 to the order minus 1. */
    private readonly scalar: bigint,
    private readonly identities: Identities = NO_IDENTITIES,
  ) {
    this.share = encode(Point.BASE.multiply(scalar).add(M.multiply(secret.w0)));
  }

  /** confirmP and K_shared, for the Verifier's share and confirmV; `ExchangeError` if the
   * confirmation is wrong: a wrong code, or someone in between. */
  finish(
    shareVerifier: Uint8Array,
    confirmation: Uint8Array,
  ): { confirmation: Uint8Array; shared: Uint8Array } {
    const base = decodePoint(shareVerifier).subtract(N.multiply(this.secret.w0));
    const z = base.multiply(this.scalar);
    const v = base.multiply(this.secret.w1);
    const { confirmProver, confirmVerifier, shared } = keys(
      transcript(this.context, this.identities, this.share, shareVerifier, z, v, this.secret.w0),
    );
    if (!equalBytes(hmac(sha256, confirmVerifier, this.share), confirmation)) {
      throw new ExchangeError('confirmation', 'the confirmation is wrong');
    }
    return { confirmation: hmac(sha256, confirmProver, shareVerifier), shared };
  }
}

/** A device's side: its share and confirmation, then the Prover's confirmation checked. The
 * simulated device plays it. */
export class Verifier {
  private expected: Uint8Array | null = null;
  private shared: Uint8Array | null = null;

  constructor(
    private readonly context: Uint8Array,
    private readonly w0: bigint,
    /** L. */
    private readonly record: Uint8Array,
    /** y, from 1 to the order minus 1. */
    private readonly scalar: bigint,
    private readonly identities: Identities = NO_IDENTITIES,
  ) {}

  /** shareV and confirmV, for the Prover's share. */
  respond(shareProver: Uint8Array): { share: Uint8Array; confirmation: Uint8Array } {
    const x = decodePoint(shareProver).subtract(M.multiply(this.w0));
    const share = encode(Point.BASE.multiply(this.scalar).add(N.multiply(this.w0)));
    const z = x.multiply(this.scalar);
    const v = decodePoint(this.record).multiply(this.scalar);
    const { confirmProver, confirmVerifier, shared } = keys(
      transcript(this.context, this.identities, shareProver, share, z, v, this.w0),
    );
    this.expected = hmac(sha256, confirmProver, share);
    this.shared = shared;
    return { share, confirmation: hmac(sha256, confirmVerifier, shareProver) };
  }

  /** K_shared, if `confirmation` is the Prover's confirmP; `ExchangeError` if not. */
  finish(confirmation: Uint8Array): Uint8Array {
    if (this.expected === null || this.shared === null) {
      throw new ExchangeError('confirmation', 'no share to confirm');
    }
    if (!equalBytes(this.expected, confirmation)) {
      throw new ExchangeError('confirmation', 'the confirmation is wrong');
    }
    return this.shared;
  }
}

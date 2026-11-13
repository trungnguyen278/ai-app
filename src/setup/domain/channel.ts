// SPDX-License-Identifier: MIT
// What set-up 2.2 encrypts, once the exchange is done (platform/protocols/setup/README.md, The
// session): the context that names a session, its keys, and each message in AES-128-GCM.
import { gcm } from '@noble/ciphers/aes.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { KEYS_INFO, LABEL } from './protocol';

const KEY_BYTES = 16;
const NONCE_BYTES = 12;
/** Bytes that sealing adds: GCM's tag. */
export const TAG_BYTES = 16;
/** A nonce is 4 zero bytes, then the sender's counter on 8 bytes, big-endian. */
const COUNTER_OFFSET = 4;
const TWO_TO_32 = 2 ** 32;

const encoder = new TextEncoder();

/** The context of SPAKE2+: SHA-256 of the label, then both hellos, as the exact bytes sent. */
export function context(appHello: Uint8Array, deviceHello: Uint8Array): Uint8Array {
  const label = encoder.encode(LABEL);
  const bytes = new Uint8Array(label.length + appHello.length + deviceHello.length);
  bytes.set(label);
  bytes.set(appHello, label.length);
  bytes.set(deviceHello, label.length + appHello.length);
  return sha256(bytes);
}

/** Each side's key, from K_shared: HKDF-SHA256, with an empty salt. */
export function sessionKeys(shared: Uint8Array): { app: Uint8Array; device: Uint8Array } {
  const keys = hkdf(sha256, shared, undefined, encoder.encode(KEYS_INFO), 2 * KEY_BYTES);
  return { app: keys.subarray(0, KEY_BYTES), device: keys.subarray(KEY_BYTES) };
}

/** The nonce of the sender's `count`th encrypted message, from 0. */
export function nonce(count: number): Uint8Array {
  const bytes = new Uint8Array(NONCE_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint32(COUNTER_OFFSET, Math.floor(count / TWO_TO_32));
  view.setUint32(COUNTER_OFFSET + 4, count % TWO_TO_32);
  return bytes;
}

/** A message that does not decrypt: the session ends. */
export class SealError extends Error {
  constructor() {
    super('a message does not decrypt');
    this.name = 'SealError';
  }
}

/** One side's encrypted messages: sealed with its key, and the other side's opened with
 * theirs, each side counting its own from 0. There is no associated data. */
export class Channel {
  private sent = 0;
  private received = 0;

  constructor(
    private readonly sendKey: Uint8Array,
    private readonly receiveKey: Uint8Array,
  ) {}

  /** The ciphertext of `plaintext`, then its 16-byte tag. */
  seal(plaintext: Uint8Array): Uint8Array {
    const sealed = gcm(this.sendKey, nonce(this.sent)).encrypt(plaintext);
    this.sent += 1;
    return sealed;
  }

  /** The plaintext of the other side's next message; `SealError` if it does not decrypt. */
  open(sealed: Uint8Array): Uint8Array {
    let plaintext: Uint8Array;
    try {
      plaintext = gcm(this.receiveKey, nonce(this.received)).decrypt(sealed);
    } catch {
      throw new SealError();
    }
    this.received += 1;
    return plaintext;
  }
}

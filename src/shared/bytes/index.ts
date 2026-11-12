// SPDX-License-Identifier: MIT
// Bytes: random ones, from the phone's cryptographic source, and their text forms, for the cloud
// and for set-up.
import { getRandomValues } from 'expo-crypto';

/** Random bytes, from a cryptographic source. */
export type Random = (count: number) => Uint8Array;

/**
 * The phone's: expo-crypto's `getRandomValues`, which reads `SecRandomCopyBytes` on iOS and
 * `SecureRandom` on Android (expo-crypto 58.0.7's source, read 2026-11-12).
 */
export const cryptoRandom: Random = (count) => getRandomValues(new Uint8Array(count));

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** `bytes` in base64url, without padding (RFC 4648, 5). */
export function base64url(bytes: Uint8Array): string {
  let text = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const characters = Math.min(4, Math.ceil(((bytes.length - index) * 8) / 6));
    for (let position = 0; position < characters; position++) {
      text += BASE64URL[(chunk >> (18 - 6 * position)) & 63];
    }
  }
  return text;
}

/** The bytes of base64url `text` without padding; `null` if it is not that. */
export function fromBase64url(text: string): Uint8Array | null {
  if (text.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    const value = BASE64URL.indexOf(character);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 255);
    }
  }
  return new Uint8Array(bytes);
}

/** The bytes of `text`, which a schema has checked to be base64url: a `TypeError` if it is not,
 * since the schema then failed. */
export function checkedBase64url(text: string): Uint8Array {
  const bytes = fromBase64url(text);
  if (bytes === null) {
    throw new TypeError('a checked field is not base64url');
  }
  return bytes;
}

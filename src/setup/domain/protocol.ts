// SPDX-License-Identifier: MIT
// The values that set-up 2.0 fixes (platform/protocols/setup/README.md), written here once.

/** The version the app speaks, in its `hello`. */
export const PROTOCOL = '2.0';

/** The major version of `version`, such as `2` for `2.0`: two sides speak if theirs match. */
export function major(version: string): string {
  return version.split('.')[0];
}

/** The label of the session's context (The session, SPAKE2+). */
export const LABEL = 'ai-platform/setup/2';

/** HKDF's info for the session keys, from K_shared (The session, SPAKE2+). */
export const KEYS_INFO = 'ai-platform/setup/2 keys';

/** The most bytes a message has, encrypted or not (The Bluetooth service; Limits). */
export const MAX_MESSAGE = 8192;

/** The smallest fragment: the smallest ATT MTU, 23, minus 3 bytes (The Bluetooth service). */
export const MIN_FRAGMENT = 20;

/** The code's decimal digits (The code). */
export const CODE_DIGITS = 8;

/** The bytes of the device's salt (Before the exchange). */
export const SALT_BYTES = 16;

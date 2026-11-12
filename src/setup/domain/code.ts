// SPDX-License-Identifier: MIT
// The code that a device shows, and the set-up string of its QR code (set-up 2.0, The code;
// Finding the device). The code is a secret for the few minutes it lives: nothing here names it
// in an error.
import { CODE_DIGITS, major, PROTOCOL } from './protocol';

/** What a set-up string gives. */
export type SetupString =
  /** The device's discriminator, and its code. */
  | { kind: 'code'; discriminator: string; code: string }
  /** A set-up string of another major version, which the app does not speak. */
  | { kind: 'version'; version: string };

const PREFIX = 'setup:';
const DISCRIMINATOR = /^[0-9A-F]{4}$/;
const CODE = new RegExp(`^[0-9]{${CODE_DIGITS}}$`);

/** What `text`, read from a QR code, gives: `setup:<major>:<discriminator>:<code>`; `null` if it
 * is no set-up string. */
export function readSetupString(text: string): SetupString | null {
  if (!text.startsWith(PREFIX)) {
    return null;
  }
  const [version, discriminator, code, ...rest] = text.slice(PREFIX.length).split(':');
  if (!/^[0-9]+$/.test(version)) {
    return null;
  }
  if (version !== major(PROTOCOL)) {
    return { kind: 'version', version };
  }
  if (rest.length > 0 || !DISCRIMINATOR.test(discriminator ?? '') || !CODE.test(code ?? '')) {
    return null;
  }
  return { kind: 'code', discriminator, code };
}

/** The code that a person typed, its 8 digits shown as two groups of four: spaces are let in
 * anywhere. `null` if it is not 8 digits. */
export function readTypedCode(text: string): string | null {
  const code = text.replace(/ /g, '');
  return CODE.test(code) ? code : null;
}

/** The discriminator that a person typed, 4 hexadecimal digits, in either case. `null` if it is
 * not one. */
export function readDiscriminator(text: string): string | null {
  const discriminator = text.trim().toUpperCase();
  return DISCRIMINATOR.test(discriminator) ? discriminator : null;
}

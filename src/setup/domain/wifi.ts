// SPDX-License-Identifier: MIT
// What set-up lets a network's name and password be (set-up 2.2, Limits), checked as the person
// types, before anything is sent; and a network's name as a person reads it.
import { MAX_PASSWORD, PSK_DIGITS, SSID_BYTES, WPA2_PASSPHRASE } from './protocol';

/** The security of a network that a password opens. */
export type Secured = 'wpa2' | 'wpa3';

const PSK = new RegExp(`^[0-9A-Fa-f]{${PSK_DIGITS}}$`);
const NUL = String.fromCharCode(0);

/** Whether `password` can open a network of `security`: WPA2 Personal takes 8 to 63 characters,
 * or 64 hexadecimal digits; WPA3 Personal, any length that set-up carries. */
export function fitsPassword(security: Secured, password: string): boolean {
  const characters = [...password].length;
  if (characters < 1 || characters > MAX_PASSWORD) {
    return false;
  }
  if (security === 'wpa3') {
    return true;
  }
  return (
    (characters >= WPA2_PASSPHRASE.least && characters <= WPA2_PASSPHRASE.most) ||
    PSK.test(password)
  );
}

/** Whether `name` can be a network's: 1 to 32 bytes in UTF-8, without U+0000. */
export function fitsSsid(name: string): boolean {
  const bytes = new TextEncoder().encode(name).length;
  return bytes >= 1 && bytes <= SSID_BYTES && !name.includes(NUL);
}

/** A network's name, to show: its text, or its bytes read as UTF-8, what is not UTF-8 replaced
 * by U+FFFD (the Encoding Standard's decoder), and its NUL bytes left out. The request names it
 * by its bytes still. */
export function shownSsid(network: { ssid?: string; ssid_hex?: string }): string {
  if (network.ssid !== undefined) {
    return network.ssid;
  }
  const hex = network.ssid_hex ?? '';
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes).split(NUL).join('');
}

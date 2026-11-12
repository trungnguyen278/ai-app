// SPDX-License-Identifier: MIT
// Set-up's messages as bytes: JSON objects in UTF-8, each checked against set-up's schema
// (platform/protocols/setup/schema.json), whichever side sent it (SEC-14).
import { ProtocolError, setupChecked, type Setup } from '@/src/shared/protocols';

const encoder = new TextEncoder();

/** A message's bytes, as sent before any encryption. */
export function encodeMessage(message: Setup.Message): Uint8Array {
  return encoder.encode(JSON.stringify(message));
}

/**
 * The message that `bytes` hold, as `definition` describes it: `from_device` for a device's,
 * `from_app` for the app's. `ProtocolError` if it is not UTF-8, not JSON, or not that message.
 */
export function decodeMessage(
  bytes: Uint8Array,
  definition: 'from_app' | 'from_device',
): Setup.Message {
  let message: unknown;
  try {
    message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ProtocolError(definition, '/', 'is not JSON in UTF-8');
  }
  return setupChecked(definition, message);
}

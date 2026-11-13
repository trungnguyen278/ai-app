// SPDX-License-Identifier: MIT
// Set-up's messages as bytes: JSON objects in UTF-8, each checked against set-up's schema
// (platform/protocols/setup/schema.json), whichever side sent it (SEC-14).
import {
  JsonError,
  ProtocolError,
  readJson,
  setupChecked,
  type Setup,
} from '@/src/shared/protocols';

const encoder = new TextEncoder();

/** A message's bytes, as sent before any encryption. */
export function encodeMessage(message: Setup.Message): Uint8Array {
  return encoder.encode(JSON.stringify(message));
}

/**
 * The JSON value that `bytes` hold, before its schema is checked: `ProtocolError` if they are
 * not UTF-8, or not JSON that every side can hold (ADR-0014). A byte order mark is kept, and so
 * refused: no side sends one (RFC 8259, 8.1), and the robot refuses one too.
 */
export function readMessage(bytes: Uint8Array, definition: 'from_app' | 'from_device'): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new ProtocolError(definition, '/', 'is not UTF-8');
  }
  try {
    return readJson(text);
  } catch (error) {
    if (!(error instanceof JsonError)) throw error;
    throw new ProtocolError(definition, '/', error.message);
  }
}

/** The `seq` of `message`, a value `readMessage` gave, if it is an object with one: then an
 * error about it replies to it, even if it breaks the schema (The session, Errors). */
export function seqOf(message: unknown): number | undefined {
  if (typeof message !== 'object' || message === null || !('seq' in message)) return undefined;
  try {
    return setupChecked('seq', message.seq);
  } catch (error) {
    if (!(error instanceof ProtocolError)) throw error;
    return undefined;
  }
}

/**
 * The message that `bytes` hold, as `definition` describes it: `from_device` for a device's,
 * `from_app` for the app's. `ProtocolError` if it cannot be read (`readMessage`), or is not
 * that message.
 */
export function decodeMessage(
  bytes: Uint8Array,
  definition: 'from_app' | 'from_device',
): Setup.Message {
  return setupChecked(definition, readMessage(bytes, definition));
}

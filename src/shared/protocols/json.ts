// SPDX-License-Identifier: MIT
// JSON that every side can hold (ai-platform's ADR-0014): what the app reads of every protocol,
// and what its simulated sides read of the app's. It is I-JSON (RFC 7493) without U+0000, and
// nests at most 64 levels deep. ai-robot's `read_json` (software/src/ai_robot/core/data.py)
// reads the same way, so that every side refuses the same texts.

/** How deep arrays and objects nest at most, the outermost counted (ADR-0014, decision 3). */
export const JSON_DEPTH = 64;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_ARRAY = 0x5b;
const CLOSE_ARRAY = 0x5d;
const OPEN_OBJECT = 0x7b;
const CLOSE_OBJECT = 0x7d;
const HIGH_SURROGATE = 0xd800;
const LOW_SURROGATE = 0xdc00;
const PAST_SURROGATES = 0xe000;

/** A text that is not JSON that every side can hold. Its message names the rule that the text
 * breaks, never the text, which may hold a token or a person's name. */
export class JsonError extends Error {
  constructor(rule: string) {
    super(rule);
    this.name = 'JsonError';
  }
}

/**
 * `text` as JSON that every side can hold: `JsonError` for a text that is not JSON, that nests
 * deeper than `JSON_DEPTH`, that holds a U+0000 or a lone surrogate in a name or a string, or a
 * number past a double. The receiver must refuse the first three, and may refuse the last
 * (ADR-0014, decision 4). The nesting is counted before the text is parsed, so that the answer
 * depends on the text, not on where the parser gives up.
 */
export function readJson(text: string): unknown {
  if (nesting(text) > JSON_DEPTH) {
    throw new JsonError(`nests deeper than ${JSON_DEPTH}`);
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new JsonError('is not JSON');
  }
  const pending = [value];
  while (pending.length > 0) {
    const item = pending.pop();
    if (typeof item === 'string') {
      if (!holdable(item)) throw new JsonError('holds a U+0000 or a lone surrogate');
    } else if (typeof item === 'number') {
      // JSON.parse reads a number past a double as an infinity.
      if (!Number.isFinite(item)) throw new JsonError('holds a number past a double');
    } else if (Array.isArray(item)) {
      for (const each of item as unknown[]) {
        pending.push(each);
      }
    } else if (typeof item === 'object' && item !== null) {
      for (const [name, each] of Object.entries(item)) {
        pending.push(name, each);
      }
    }
  }
  return value;
}

/** How deep `text` nests at most: its brackets outside its strings, as JSON reads them. */
function nesting(text: string): number {
  let depth = 0;
  let deepest = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (inString) {
      if (code === BACKSLASH) {
        index += 1;
      } else if (code === QUOTE) {
        inString = false;
      }
    } else if (code === QUOTE) {
      inString = true;
    } else if (code === OPEN_ARRAY || code === OPEN_OBJECT) {
      depth += 1;
      deepest = Math.max(deepest, depth);
    } else if (code === CLOSE_ARRAY || code === CLOSE_OBJECT) {
      depth -= 1;
    }
  }
  return deepest;
}

/** Whether `text` holds no U+0000 and no lone surrogate, which UTF-8 cannot encode. */
function holdable(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0 || (code >= LOW_SURROGATE && code < PAST_SURROGATES)) {
      return false;
    }
    if (code >= HIGH_SURROGATE && code < LOW_SURROGATE) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= LOW_SURROGATE && next < PAST_SURROGATES)) {
        return false;
      }
      index += 1;
    }
  }
  return true;
}

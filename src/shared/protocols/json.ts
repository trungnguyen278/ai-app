// SPDX-License-Identifier: MIT
// JSON that every side can hold (ai-platform's ADR-0014): what the app reads of every protocol,
// and what its simulated sides read of the app's. It is I-JSON (RFC 7493) without U+0000, and
// nests at most 64 levels deep. ai-robot's `read_json` (software/src/ai_robot/core/data.py) and
// ai-cloud's read the same way, so that every side refuses the same texts.

/** How deep arrays and objects nest at most, the outermost counted (ADR-0014, decision 3). */
export const JSON_DEPTH = 64;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const COMMA = 0x2c;
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
 * deeper than `JSON_DEPTH`, that holds a U+0000 or a lone surrogate in a name or a string, a
 * number past a double's range, written with a fraction, an exponent or as an integer, or a name
 * twice in one object. The receiver must refuse the first three, and may refuse the others
 * (ADR-0014, decision 4).
 * - The nesting is counted before the text is parsed, so that the answer depends on the text,
 *   not on where the parser gives up.
 * - A repeated name is refused, as I-JSON does (RFC 7493, 2.3), because `JSON.parse` keeps only
 *   its last value: a U+0000 or a number past a double in a value it dropped would pass unseen.
 * - The text is read in time that grows with its length: each pass over it reads a string once,
 *   whatever escapes it holds.
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
  if (repeatsAName(text)) {
    throw new JsonError('repeats a name in an object');
  }
  const pending = [value];
  while (pending.length > 0) {
    const item = pending.pop();
    if (typeof item === 'string') {
      if (!holdable(item)) throw new JsonError('holds a U+0000 or a lone surrogate');
    } else if (typeof item === 'number') {
      // JSON.parse reads a number past a double as an infinity, whether its text is an integer
      // or has a fraction or an exponent.
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
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === QUOTE) {
      index = closing(text, index);
    } else if (code === OPEN_ARRAY || code === OPEN_OBJECT) {
      depth += 1;
      deepest = Math.max(deepest, depth);
    } else if (code === CLOSE_ARRAY || code === CLOSE_OBJECT) {
      depth -= 1;
    }
  }
  return deepest;
}

/** Whether an object of `text`, which is JSON, holds a name twice, as JSON reads the names. */
function repeatsAName(text: string): boolean {
  // The names of each object open around the place read, or null for an array.
  const open: (Set<string> | null)[] = [];
  let naming = false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === QUOTE) {
      const end = closing(text, index);
      if (naming) {
        const names = open[open.length - 1]!;
        const name = JSON.parse(text.slice(index, end + 1)) as string;
        if (names.has(name)) return true;
        names.add(name);
        naming = false;
      }
      index = end;
    } else if (code === OPEN_OBJECT) {
      open.push(new Set());
      naming = true;
    } else if (code === OPEN_ARRAY) {
      open.push(null);
    } else if (code === CLOSE_ARRAY || code === CLOSE_OBJECT) {
      open.pop();
    } else if (code === COMMA) {
      naming = open[open.length - 1] !== null;
    }
  }
  return false;
}

/**
 * Where the string that opens at `start` closes: the index of its closing quote, or the text's
 * last index when it never closes. An escaped character is passed over, whatever it is, so the
 * string is read once, as the robot's pattern `"[^"\\]*(?:\\.[^"\\]*)*"?` reads it.
 */
function closing(text: string, start: number): number {
  for (let index = start + 1; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === BACKSLASH) {
      index += 1;
    } else if (code === QUOTE) {
      return index;
    }
  }
  return text.length - 1;
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

// SPDX-License-Identifier: MIT
// JSON that every side can hold (ai-platform's ADR-0014), as the app reads every protocol.
import { JSON_DEPTH, JsonError, readJson } from '@/src/shared/protocols';

/** JSON's escape of the code unit `hex`, spelled out so that no tool turns it into the character. */
const escaped = (hex: string) => `${String.fromCharCode(0x5c)}u${hex}`;
const nested = (depth: number, open = '[', close = ']') =>
  `${open.repeat(depth)}${close.repeat(depth)}`;

function refusal(text: string): JsonError {
  try {
    readJson(text);
  } catch (error) {
    if (error instanceof JsonError) return error;
    throw error;
  }
  throw new Error('expected a JsonError');
}

test('JSON that every side can hold is read as JSON.parse reads it', () => {
  const text = `{"name":"Café ${escaped('d83d')}${escaped('de00')} 😀","list":[1,2.5,-3e2,true,null]}`;
  expect(readJson(text)).toEqual(JSON.parse(text));
  expect(readJson(nested(JSON_DEPTH))).toEqual(JSON.parse(nested(JSON_DEPTH)));
  // A string alone is JSON too (RFC 8259, 2).
  expect(readJson('"a"')).toBe('a');
  // Brackets within strings, and escaped quotes, nest nothing.
  const inStrings = `{"a":"[[[{{{${escaped('0022')}]]","b":"${'['.repeat(100)}"}`;
  expect(readJson(`[${inStrings}]`)).toEqual([JSON.parse(inStrings)]);
  const brackets = '['.repeat(JSON_DEPTH + 1);
  const quoted = `["${String.fromCharCode(0x5c)}"${brackets}"]`;
  expect(readJson(quoted)).toEqual([`"${brackets}`]);
});

test('JSON nested deeper than 64, the outermost counted, is refused before it is parsed', () => {
  expect(JSON_DEPTH).toBe(64);
  expect(refusal(nested(JSON_DEPTH + 1)).message).toBe('nests deeper than 64');
  const objects = `${'{"a":'.repeat(JSON_DEPTH)}{}${'}'.repeat(JSON_DEPTH)}`;
  expect(refusal(objects).message).toBe('nests deeper than 64');
  expect(readJson(`${'{"a":'.repeat(JSON_DEPTH - 1)}{}${'}'.repeat(JSON_DEPTH - 1)}`)).toBeTruthy();
  // The answer depends on the text: deep JSON that is broken further on is refused for its depth.
  expect(refusal(`${nested(JSON_DEPTH + 1)} oops`).message).toBe('nests deeper than 64');
  // A string never closed nests nothing, as the robot's pattern reads it: the text is not JSON.
  expect(refusal(`["${'['.repeat(JSON_DEPTH + 1)}`).message).toBe('is not JSON');
  // Depth that closes again counts once.
  expect(readJson(`[${nested(JSON_DEPTH - 1)},${nested(JSON_DEPTH - 1)}]`)).toHaveLength(2);
});

test('a U+0000 or a lone surrogate, in a name or a string, escaped or not, is refused', () => {
  const texts = [
    `["a${escaped('0000')}b"]`,
    `{"a${escaped('0000')}":1}`,
    `["${escaped('d800')}"]`,
    `["${escaped('d800')}x"]`,
    `["${escaped('d800')}${escaped('d800')}"]`,
    `["${escaped('dc00')}"]`,
    `["x${escaped('dfff')}${escaped('d83d')}"]`,
    `{"${escaped('dbff')}":"a"}`,
    `[{"a":[["${String.fromCharCode(0xdc00)}"]]}]`,
  ];
  for (const text of texts) {
    expect(refusal(text).message).toBe('holds a U+0000 or a lone surrogate');
  }
});

test('a number past a double, and what is not JSON, are refused, naming no value', () => {
  expect(refusal('[1e400]').message).toBe('holds a number past a double');
  expect(refusal('{"a":-1e999}').message).toBe('holds a number past a double');
  // The same, written as an integer: a reader that keeps integers apart (Python's) would take it.
  const digits = `1${'0'.repeat(400)}`;
  for (const text of [`[${digits}]`, `{"a":-${digits}}`, '[1E400]', `[${digits}.5]`]) {
    expect(refusal(text).message).toBe('holds a number past a double');
  }
  expect(readJson(`[${'9'.repeat(308)}]`)).toEqual([Number('9'.repeat(308))]);
  expect(readJson('[1.7976931348623157e308, 5e-324]')).toEqual([1.7976931348623157e308, 5e-324]);
  // A control character in a string must be escaped (RFC 8259, 7).
  const raw = `["${String.fromCharCode(0)}"]`;
  for (const text of [
    '',
    '{"secret":',
    '<html>secret</html>',
    'NaN',
    '[Infinity]',
    "{'a':1}",
    raw,
  ]) {
    const error = refusal(text);
    expect(error.message).toBe('is not JSON');
    expect(error.name).toBe('JsonError');
  }
});

test('a name twice in one object is refused, though the value JSON.parse keeps is fine', () => {
  const texts = [
    // The value that JSON.parse would drop holds what no side can hold.
    `{"a":"${escaped('0000')}","a":"x"}`,
    '{"a":1e400,"a":1}',
    '{"a":1,"a":1}',
    // The same name, spelled with an escape.
    `{"a":1,"${escaped('0061')}":2}`,
    `{"${escaped('d83d')}${escaped('de00')}":1,"😀":2}`,
    // After an object or an array within, and deeper in.
    '{"a":{"x":1},"b":[{"c":1}],"a":2}',
    '[{"b":{"a":1,"a":2}}]',
    // Repeated names that are lone surrogates: the repeat is found first.
    `{"${escaped('d800')}":1,"${escaped('d800')}":2}`,
  ];
  for (const text of texts) {
    expect(refusal(text).message).toBe('repeats a name in an object');
  }
  expect(refusal(`{"${escaped('d800')}":1}`).message).toBe('holds a U+0000 or a lone surrogate');
  // A name again in another object, as a value, in a list, or in another case is no repeat.
  const fine = '[{"a":1},{"a":2},{"a":"a","b":{"a":"b","c":0},"c":["a","a","a"],"A":0,"a ":0}]';
  expect(readJson(fine)).toEqual(JSON.parse(fine));
  // A text that is not JSON is refused for that, whatever its names.
  expect(refusal('{"a":1,"a":2').message).toBe('is not JSON');
});

describe('a text is read in time that grows with its length, not its square', () => {
  const slash = String.fromCharCode(0x5c);
  // Texts that a reader going back over what it read, at each escape, name or bracket, would
  // take hours over at 1 MiB, as ai-robot's first depth count did with a string never closed.
  const shapes: Record<string, (size: number) => string> = {
    'escaped quotes in a string never closed': (size) => `["${`${slash}"`.repeat(size / 2)}`,
    'escaped quotes in a string': (size) => `["${`${slash}"`.repeat(size / 2)}"]`,
    'brackets in a string': (size) => `["${'['.repeat(size)}"]`,
    'names in one object': (size) =>
      `{${Array.from({ length: size / 16 }, (_, index) => `"n${index}":0`).join(',')}}`,
    'escaped names in one object': (size) =>
      `{${Array.from({ length: size / 16 }, (_, index) => `"${escaped('006e')}${index}":0`).join(',')}}`,
    'a name repeated': (size) => `{${'"a":0,'.repeat(size / 6)}"b":0}`,
    'objects opened and closed': (size) => `[${'{"a":[]},'.repeat(size / 10)}0]`,
    'brackets opened': (size) => '['.repeat(size),
  };
  // Sizes from 16 KiB to 1 MiB, each read within 0.1 s and 4 ms a KiB: a reader that took the
  // square of the length fails at the smaller sizes, before the larger ones would hang the test.
  const SIZES = [16, 64, 256, 1024].map((kib) => kib * 1024);
  const budget = (size: number) => 100 + (4 * size) / 1024;

  for (const [shape, text] of Object.entries(shapes)) {
    test(shape, () => {
      for (const size of SIZES) {
        const given = text(size);
        const start = performance.now();
        try {
          readJson(given);
        } catch (error) {
          if (!(error instanceof JsonError)) throw error;
        }
        // Each size has its own budget, which the failure shows.
        expect(performance.now() - start).toBeLessThan(budget(size));
      }
    });
  }
});

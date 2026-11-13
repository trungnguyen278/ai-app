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

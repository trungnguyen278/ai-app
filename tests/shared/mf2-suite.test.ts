// SPDX-License-Identifier: MIT
// The MF2 library against Unicode MessageFormat's test suite, which ai-platform keeps
// (catalogs/README.md, "The working group's tests").
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { MessageFormat } from 'messageformat';
import { DraftFunctions } from 'messageformat/functions';

const SUITE = join(__dirname, '..', '..', 'platform', 'catalogs', 'mf2-tests', 'tests');

interface Case {
  src: string;
  locale?: string;
  params?: { name: string; value: unknown }[];
  bidiIsolation?: 'default' | 'none';
  exp?: string;
  expErrors?: unknown[];
}

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? files(path) : name.endsWith('.json') ? [path] : [];
  });
}

const cases = files(SUITE).flatMap((path) => {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return (data.tests as Case[])
    .map((test): Case => ({ ...data.defaultTestProperties, ...test }))
    .filter((test) => !test.src.includes(':test:')) // the suite's own functions
    .map((test): [string, Case] => [`${relative(SUITE, path)}: ${test.src}`, test]);
});

test('the suite is there', () => {
  // Fewer cases than this means the pin of ai-platform lost the suite.
  expect(cases.length).toBeGreaterThanOrEqual(434);
});

test.each(cases)('%s', (_, test) => {
  const errors: unknown[] = [];
  let text: string | undefined;
  try {
    const format = new MessageFormat(test.locale ?? 'en-US', test.src, {
      functions: DraftFunctions,
      bidiIsolation: test.bidiIsolation ?? 'none',
    });
    const values = Object.fromEntries((test.params ?? []).map((p) => [p.name, p.value]));
    text = format.format(values, (error) => errors.push(error));
  } catch (error) {
    errors.push(error);
  }
  expect(errors.length > 0).toBe((test.expErrors?.length ?? 0) > 0);
  if (test.exp !== undefined) expect(text).toBe(test.exp);
});

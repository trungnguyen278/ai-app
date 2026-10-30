// SPDX-License-Identifier: MIT
// The app's catalogs, checked as ai-platform's catalogs/README.md asks of every component.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020';
import { MessageFormat, parseMessage, visit } from 'messageformat';

import { CATALOGS, SOURCE } from '@/src/shared/catalog';

const ROOT = join(__dirname, '..', '..');
const LOCALES = join(ROOT, 'locales');
const SCHEMA = join(ROOT, 'platform', 'catalogs', 'schema.json');

const files = readdirSync(LOCALES)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -'.json'.length))
  .sort();
const read = (tag: string): Record<string, string> =>
  JSON.parse(readFileSync(join(LOCALES, `${tag}.json`), 'utf8'));
const source = read(SOURCE);

/** The variables a message is given: those it uses or declares, but not its own locals. */
function variables(message: string): Set<string> {
  const used = new Set<string>();
  const locals = new Set<string>();
  visit(parseMessage(message), {
    declaration: (declaration) => {
      if (declaration.type === 'local') locals.add(declaration.name);
    },
    value: (value) => {
      if (value.type === 'variable') used.add(value.name);
    },
  });
  return new Set([...used].filter((name) => !locals.has(name)));
}

test('every catalog in locales/ is bundled, and English is one', () => {
  expect(Object.keys(CATALOGS).sort()).toEqual(files);
  expect(files).toContain(SOURCE);
});

test.each(files)("%s follows the catalogs' schema", (tag) => {
  const validate = new Ajv2020({ allErrors: true }).compile(
    JSON.parse(readFileSync(SCHEMA, 'utf8')),
  );
  expect(validate(read(tag)) ? [] : validate.errors).toEqual([]);
});

test.each(files)('every message of %s parses as MessageFormat 2', (tag) => {
  for (const [id, message] of Object.entries(read(tag))) {
    expect(() => new MessageFormat(tag, message)).not.toThrow();
    expect(id).toBeTruthy();
  }
});

test.each(files.filter((tag) => tag !== SOURCE))(
  '%s has only IDs that English has, with only its variables',
  (tag) => {
    const problems: string[] = [];
    for (const [id, message] of Object.entries(read(tag))) {
      if (!(id in source)) {
        problems.push(`${id}: not in ${SOURCE}.json`);
        continue;
      }
      const allowed = variables(source[id]);
      for (const name of variables(message)) {
        if (!allowed.has(name)) problems.push(`${id}: $${name} is not in ${SOURCE}.json`);
      }
    }
    expect(problems).toEqual([]);
  },
);

test.each(files.filter((tag) => tag !== SOURCE))('%s translates every message', (tag) => {
  // A message missing from a translation is a warning, not an error (ADR-0002): it falls back.
  const missing = Object.keys(source).filter((id) => !(id in read(tag)));
  if (missing.length > 0) {
    console.warn(`${tag}.json lacks ${missing.join(', ')}: they show in English`);
  }
});

test('the variables of a message are those it is given', () => {
  expect(variables('.input {$relation :string}\n{{Hello!}}')).toEqual(new Set(['relation']));
  expect(variables('.local $n = {$count :number}\n{{{$n} and {$name}}}')).toEqual(
    new Set(['count', 'name']),
  );
});

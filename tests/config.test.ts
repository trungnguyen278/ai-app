// SPDX-License-Identifier: MIT
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { catalogLanguages, ENVIRONMENT_VARIABLE, loadSettings, merge } from '@/app.config';

const CONFIG = join(__dirname, '..', 'config');

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'config-'));
  cpSync(CONFIG, directory, { recursive: true });
});

afterEach(() => rmSync(directory, { recursive: true, force: true }));

test('every environment is complete', () => {
  for (const environment of ['development', 'production']) {
    expect(loadSettings(environment).app.slug).toBe('ai-app');
  }
});

test('the environment is base, then its file, then local.toml', () => {
  expect(loadSettings('production', directory).app.android_package).toBe(
    'io.github.trungnguyen278.aiapp',
  );
  expect(loadSettings('development', directory).app.android_package).toBe(
    'io.github.trungnguyen278.aiapp.dev',
  );
  writeFileSync(join(directory, 'local.toml'), '[app]\nname = "Mine"\n');
  expect(loadSettings('development', directory).app).toMatchObject({
    name: 'Mine',
    android_package: 'io.github.trungnguyen278.aiapp.dev',
  });
});

test('the environment is required and must exist', () => {
  expect(() => loadSettings(undefined, directory)).toThrow(ENVIRONMENT_VARIABLE);
  expect(() => loadSettings('', directory)).toThrow(ENVIRONMENT_VARIABLE);
  expect(() => loadSettings('staging', directory)).toThrow(
    "unknown environment 'staging' (available: development, production)",
  );
});

test.each([
  ['a missing value', '[app]\nscheme = "x"\n', 'base.toml', "must have required property 'name'"],
  [
    'an unknown key',
    '[app]\nnmae = "x"\n',
    'local.toml',
    '/app must NOT have additional properties (nmae)',
  ],
  ['a wrong type', '[app]\nname = 3\n', 'local.toml', '/app/name must be string'],
  [
    'a bad identifier',
    '[app]\nandroid_package = "1x"\n',
    'local.toml',
    '/app/android_package must match',
  ],
  ['malformed TOML', '[app\n', 'local.toml', 'local.toml'],
])('%s stops the build, named', (_, text, file, problem) => {
  writeFileSync(join(directory, file), text);
  expect(() => loadSettings('production', directory)).toThrow(problem);
});

test('a problem never shows the value', () => {
  writeFileSync(join(directory, 'local.toml'), '[app]\nandroid_package = "s3cr3t!"\n');
  expect(() => loadSettings('production', directory)).toThrow(/^(?!.*s3cr3t).*$/s);
});

test('merge merges tables and replaces the rest', () => {
  const base = { a: { b: 1, c: [1, 2] }, d: 1 };
  const override = { a: { c: [3] }, d: { e: 2 } };
  expect(merge(base, override)).toEqual({ a: { b: 1, c: [3] }, d: { e: 2 } });
  expect(base).toEqual({ a: { b: 1, c: [1, 2] }, d: 1 });
});

test('the languages offered to the system are the catalogs in locales/', () => {
  expect(catalogLanguages()).toEqual(['en', 'vi']);
});

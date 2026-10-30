// SPDX-License-Identifier: MIT
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import {
  Catalog,
  CatalogProvider,
  type Catalogs,
  languageChain,
  type OnFailure,
  useText,
} from '@/src/shared/catalog';

// ai-platform's example catalogs: plurals, numbers, and Vietnamese forms of address.
const EXAMPLES = join(__dirname, '..', '..', 'platform', 'catalogs', 'examples');
const example = (tag: string) => JSON.parse(readFileSync(join(EXAMPLES, `${tag}.json`), 'utf8'));

// What the default bidi isolation puts around placeholders.
const plain = (text: string) => text.replace(/[⁦-⁩]/g, '');

describe('languageChain', () => {
  test.each([
    [
      ['vi-VN', 'en-US'],
      ['en', 'vi'],
      ['vi', 'en'],
    ],
    [['pt-BR'], ['en', 'pt'], ['pt', 'en']],
    [['pt-BR'], ['en', 'pt-BR', 'pt'], ['pt-BR', 'en']],
    [['zh-Hant-TW'], ['en', 'zh-Hant'], ['zh-Hant', 'en']],
    [
      ['fr-FR', 'VI'],
      ['en', 'vi'],
      ['vi', 'en'],
    ],
    [
      ['en-GB', 'vi'],
      ['en', 'vi'],
      ['en', 'vi'],
    ],
    [[], ['en', 'vi'], ['en']],
  ])('%j among %j gives %j', (preferred, available, chain) => {
    expect(languageChain(preferred, available)).toEqual(chain);
  });
});

describe('Catalog', () => {
  const catalogs: Catalogs = { en: example('en'), vi: example('vi') };
  let failures: Parameters<OnFailure>[];
  const onFailure: OnFailure = (...report) => failures.push(report);

  beforeEach(() => {
    failures = [];
  });

  test('gives the first language that has the message', () => {
    expect(new Catalog(catalogs, ['vi', 'en'], onFailure).text('devices.empty')).toBe(
      'Chưa có thiết bị nào.',
    );
    expect(new Catalog(catalogs, ['en'], onFailure).text('devices.empty')).toBe('No device yet.');
  });

  test("selects a language's own variants, which English does not need", () => {
    const vi = new Catalog(catalogs, ['vi', 'en'], onFailure);
    expect(vi.text('greeting.hello', { relation: 'elder_male' })).toBe('Chào anh!');
    expect(vi.text('greeting.hello', { relation: 'younger' })).toBe('Chào em!');
    expect(vi.text('greeting.hello', { relation: 'stranger' })).toBe('Chào bạn!');
    expect(
      new Catalog(catalogs, ['en'], onFailure).text('greeting.hello', { relation: 'younger' }),
    ).toBe('Hello!');
  });

  test("formats plurals and numbers by each language's rules", () => {
    const en = new Catalog(catalogs, ['en'], onFailure);
    expect(plain(en.text('devices.count', { count: 1 }))).toBe('1 device');
    expect(plain(en.text('devices.count', { count: 1000 }))).toBe('1,000 devices');
    const vi = new Catalog(catalogs, ['vi', 'en'], onFailure);
    expect(plain(vi.text('devices.count', { count: 1000 }))).toBe('1.000 thiết bị');
    expect(failures).toEqual([]);
  });

  test('falls back along the languages to English when a message is missing', () => {
    const partial: Catalogs = { en: catalogs.en, vi: {} };
    expect(new Catalog(partial, ['vi', 'en'], onFailure).text('devices.empty')).toBe(
      'No device yet.',
    );
    expect(failures).toEqual([]);
  });

  test('falls back, and reports only the ID and language, when a message fails', () => {
    const broken: Catalogs = {
      en: catalogs.en,
      vi: { 'devices.empty': '{$missing :number}', 'greeting.hello': '{{unclosed' },
    };
    const catalog = new Catalog(broken, ['vi', 'en'], onFailure);
    expect(catalog.text('devices.empty', { secret: 'p4ss' })).toBe('No device yet.');
    expect(catalog.text('greeting.hello', { relation: 'younger' })).toBe('Hello!');
    expect(failures).toEqual([
      ['devices.empty', 'vi'],
      ['greeting.hello', 'vi'],
    ]);
  });

  test('gives the ID when no language has the message', () => {
    expect(new Catalog(catalogs, ['vi', 'en'], onFailure).text('no.such')).toBe('no.such');
  });
});

describe('useText', () => {
  function Greeting() {
    const text = useText();
    return <Text>{text('greeting.hello', { relation: 'elder_female' })}</Text>;
  }

  test("gives the provider's texts", async () => {
    const catalog = new Catalog({ en: example('en'), vi: example('vi') }, ['vi', 'en'], () => {});
    await render(
      <CatalogProvider catalog={catalog}>
        <Greeting />
      </CatalogProvider>,
    );
    expect(screen.getByText('Chào chị!')).toBeOnTheScreen();
  });

  test('needs a provider', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<Greeting />)).rejects.toThrow('useText needs a CatalogProvider');
  });
});

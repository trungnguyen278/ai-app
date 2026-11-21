// SPDX-License-Identifier: MIT
// The catalogs on a phone, whose Hermes builds less of Intl than Node (tests/hermes.ts,
// ADR-0008): every message formats there, to the text the other tests see.
import assert from 'node:assert';

import { parseMessage, visit } from 'messageformat';

import { Catalog, CATALOGS, type OnFailure } from '@/src/shared/catalog';

import { Hermes, hermesIntl, PLATFORMS } from '../hermes';

type CatalogModule = typeof import('@/src/shared/catalog');

/** A value of the kind each of the catalogs' functions formats. */
const SAMPLES: Readonly<Record<string, unknown>> = {
  date: new Date('2026-11-06T08:10:00Z'),
  datetime: new Date('2026-11-06T08:10:00Z'),
  time: new Date('2026-11-06T08:10:00Z'),
  integer: 1234,
  number: 4.56,
};

/** A value for each variable of `message`: its function's kind, else a name. */
function valuesFor(message: string): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  visit(parseMessage(message), {
    functionRef: (ref, _context, argument) => {
      if (argument?.type === 'variable') values[argument.name] = SAMPLES[ref.name] ?? 'Linh';
    },
    value: (value) => {
      if (value.type === 'variable') values[value.name] ??= 'Linh';
    },
  });
  return values;
}

const LANGUAGES = Object.keys(CATALOGS);

test("Hermes's Intl has no Locale, no PluralRules, and on iOS no NumberFormat.formatToParts", () => {
  for (const platform of PLATFORMS) {
    const intl = hermesIntl(platform);
    expect(['Locale' in intl, 'PluralRules' in intl, 'ListFormat' in intl]).toEqual([
      false,
      false,
      false,
    ]);
    expect(Object.prototype.toString.call(intl)).toBe('[object Intl]');
    // format and compare are getters of functions bound to their object, as ECMA-402 defines.
    const { format } = new intl.DateTimeFormat('en', { timeZone: 'UTC' });
    expect(format(0)).toBe('1/1/1970');
    expect(new intl.NumberFormat('vi').format(1234.5)).toBe('1.234,5');
    // By code points, as a sort without the collator's, "Z" would come first.
    expect(['Z', 'a'].sort(new intl.Collator('en').compare)).toEqual(['a', 'Z']);
    expect(new intl.DateTimeFormat('en').resolvedOptions().locale).toBe('en');
    expect(() => intl.NumberFormat.prototype.resolvedOptions.call({})).toThrow(TypeError);
    expect(intl.getCanonicalLocales('EN-gb')).toEqual(['en-GB']);
    expect(intl.NumberFormat.supportedLocalesOf(['vi'])).toEqual(['vi']);
  }
  const parts = (platform: 'android' | 'ios') =>
    typeof new (hermesIntl(platform).NumberFormat)('en').formatToParts;
  expect([parts('android'), parts('ios')]).toEqual(['function', 'undefined']);
});

test("runs code with Hermes's Intl, and gives Node's back", () => {
  const hermes = new Hermes('android');
  expect(hermes.run(() => [globalThis.Intl === hermes.intl, 'Locale' in Intl])).toEqual([
    true,
    false,
  ]);
  expect(() => hermes.run(() => assert.fail('it failed'))).toThrow('it failed');
  expect(globalThis.Intl).not.toBe(hermes.intl);
  expect('Locale' in Intl).toBe(true);
});

describe.each(PLATFORMS)('on Hermes for %s', (platform) => {
  const hermes = new Hermes(platform);
  const phone = hermes.load<CatalogModule>('@/src/shared/catalog');
  let failures: Parameters<OnFailure>[];
  const onFailure: OnFailure = (...report) => failures.push(report);

  beforeEach(() => {
    failures = [];
  });

  test.each(LANGUAGES)('every message of %s formats, as on Node', (language) => {
    const node = new Catalog(CATALOGS, [language], onFailure);
    const onPhone = hermes.run(() => new phone.Catalog(phone.CATALOGS, [language], onFailure));
    for (const [id, message] of Object.entries(CATALOGS[language])) {
      const values = valuesFor(message);
      const text = hermes.run(() => onPhone.text(id, values));
      expect([id, text]).toEqual([id, node.text(id, values)]);
      expect(text).not.toBe(id);
    }
    expect(failures).toEqual([]);
  });

  test.each(LANGUAGES)("has %s's plural rules", (language) => {
    expect(hermes.run(() => new hermes.intl.PluralRules(language).resolvedOptions().locale)).toBe(
      language,
    );
  });

  test('canonicalizes tags as the standard does, as its Intl.Locale needs', () => {
    // Node's own, under Hermes's here, drops a key's "yes", which only "true" loses (UTS 35).
    expect(hermes.run(() => hermes.intl.getCanonicalLocales('en-u-aa-yes'))).toEqual([
      'en-u-aa-yes',
    ]);
  });

  test("chooses a plural's variant", () => {
    const catalogs = {
      en: { devices: '.input {$count :integer}\n.match $count\none {{One}}\n* {{{$count}}}' },
    };
    const onPhone = hermes.run(() => new phone.Catalog(catalogs, ['en-GB'], onFailure));
    const plain = (count: number) => hermes.run(() => onPhone.plainText('devices', { count }));
    expect([plain(1), plain(2), plain(1000)]).toEqual(['One', '2', '1,000']);
    expect(failures).toEqual([]);
  });
});

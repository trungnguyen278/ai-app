// SPDX-License-Identifier: MIT
// Every text people see, from Unicode MessageFormat 2 messages, looked up along the owner's
// languages, then English (ai-platform's catalogs/README.md; its ADR-0002 and ADR-0007).
import { MessageFormat } from 'messageformat';
// The functions LDML 48.2 adds to the defaults, :date, :datetime and :time among them, by which
// dates are formatted (the catalogs' README). The working group's tests check them
// (tests/shared/mf2-suite.test.ts).
import { DraftFunctions } from 'messageformat/functions';

/** One language's messages, by ID. */
export type Messages = Readonly<Record<string, string>>;
/** Each language's messages, by BCP 47 tag. */
export type Catalogs = Readonly<Record<string, Messages>>;
/** What a message's variables are given. */
export type Values = Readonly<Record<string, unknown>>;
/** Told of a message that would not format: its ID and language, never its values. */
export type OnFailure = (id: string, language: string) => void;

/** Whether a message's values are isolated from the text around them (MF2's bidiIsolation). */
type Isolation = 'default' | 'none';

/** A message ready to format, in `locales`, with the functions that dates need. */
function newFormat(locales: string[], source: string, isolation: Isolation) {
  return new MessageFormat(locales, source, {
    bidiIsolation: isolation,
    functions: DraftFunctions,
  });
}
type Format = ReturnType<typeof newFormat>;

/** The source language: it has every message, and every look-up ends with it (ADR-0002). */
export const SOURCE = 'en';

/** Tags by their lower case, since BCP 47 tags match whatever their case. */
function byCase(tags: readonly string[]): ReadonlyMap<string, string> {
  return new Map(tags.map((tag) => [tag.toLowerCase(), tag]));
}

/** The tag of `tags` that RFC 4647's lookup finds for `wanted`: `pt-BR`, else `pt`. */
function lookUp(wanted: string, tags: ReadonlyMap<string, string>): string | undefined {
  const subtags = wanted.toLowerCase().split('-');
  for (let count = subtags.length; count > 0; count--) {
    const match = tags.get(subtags.slice(0, count).join('-'));
    if (match !== undefined) return match;
  }
  return undefined;
}

/** Whether `tag` is one that Intl takes: a phone's tag that is not makes no format fail. */
function wellFormed(tag: string): boolean {
  try {
    return Intl.getCanonicalLocales(tag).length === 1;
  } catch {
    return false;
  }
}

/**
 * The languages to look messages up in: each of `preferred` that `available` has, in order,
 * matched by RFC 4647's lookup (`pt-BR`, then `pt`), and the source last.
 */
export function languageChain(
  preferred: readonly string[],
  available: readonly string[],
): string[] {
  const tags = byCase(available);
  const chain: string[] = [];
  for (const wanted of [...preferred, SOURCE]) {
    const match = lookUp(wanted, tags);
    if (match !== undefined && !chain.includes(match)) chain.push(match);
  }
  return chain;
}

export class Catalog {
  /** The languages messages are looked up in, in order: `languageChain` of the preferred. */
  readonly languages: readonly string[];
  /**
   * The locales each language formats its values in: the phone's own tags that chose it, then
   * the language itself, so that an `en` message has a British phone's dates (`en-GB`).
   */
  private readonly locales: ReadonlyMap<string, readonly string[]>;
  private readonly formats = new Map<string, Format>();

  /** The catalogs, for a person who prefers `preferred`: BCP 47 tags, most preferred first. */
  constructor(
    private readonly catalogs: Catalogs,
    preferred: readonly string[],
    private readonly onFailure: OnFailure,
  ) {
    const tags = byCase(Object.keys(catalogs));
    this.languages = languageChain(preferred, Object.keys(catalogs));
    const regional = preferred.filter(wellFormed);
    this.locales = new Map(
      this.languages.map((language) => [
        language,
        [...new Set([...regional.filter((tag) => lookUp(tag, tags) === language), language])],
      ]),
    );
  }

  /**
   * Message `id` with `values`, in the first of the languages that formats it without error.
   * Each value is isolated, as MF2 does by default, so that one written right to left cannot
   * reorder the text around it.
   */
  text(id: string, values: Values = {}): string {
    return this.formatted(id, values, 'default');
  }

  /**
   * The same text without the isolating marks, for text that becomes data, such as a name
   * the person may keep or a message they send: the marks are invisible, and would go with it.
   */
  plainText(id: string, values: Values = {}): string {
    return this.formatted(id, values, 'none');
  }

  private formatted(id: string, values: Values, isolation: Isolation): string {
    for (const language of this.languages) {
      const source = this.catalogs[language]?.[id];
      if (source === undefined) continue;
      let failed = false;
      try {
        const text = this.format(language, id, source, isolation).format({ ...values }, () => {
          failed = true;
        });
        if (!failed) return text;
      } catch {
        // A message that does not parse fails like one that does not format.
      }
      this.onFailure(id, language);
    }
    return id; // English lacks it too, which the catalogs' checks forbid
  }

  private format(language: string, id: string, source: string, isolation: Isolation): Format {
    const key = `${language}\n${id}\n${isolation}`;
    let format = this.formats.get(key);
    if (format === undefined) {
      format = newFormat([...(this.locales.get(language) ?? [language])], source, isolation);
      this.formats.set(key, format);
    }
    return format;
  }
}

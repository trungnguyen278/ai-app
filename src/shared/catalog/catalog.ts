// SPDX-License-Identifier: MIT
// Every text people see, from Unicode MessageFormat 2 messages, looked up along the owner's
// languages, then English (ai-platform's catalogs/README.md; its ADR-0002 and ADR-0007).
import { MessageFormat } from 'messageformat';

/** One language's messages, by ID. */
export type Messages = Readonly<Record<string, string>>;
/** Each language's messages, by BCP 47 tag. */
export type Catalogs = Readonly<Record<string, Messages>>;
/** What a message's variables are given. */
export type Values = Readonly<Record<string, unknown>>;
/** Told of a message that would not format: its ID and language, never its values. */
export type OnFailure = (id: string, language: string) => void;

/** The source language: it has every message, and every look-up ends with it (ADR-0002). */
export const SOURCE = 'en';

/**
 * The languages to look messages up in: each of `preferred` that `available` has, in order,
 * matched by RFC 4647's lookup (`pt-BR`, then `pt`), and the source last.
 */
export function languageChain(
  preferred: readonly string[],
  available: readonly string[],
): string[] {
  const tags = new Map(available.map((tag) => [tag.toLowerCase(), tag]));
  const chain: string[] = [];
  for (const wanted of [...preferred, SOURCE]) {
    const subtags = wanted.toLowerCase().split('-');
    for (let count = subtags.length; count > 0; count--) {
      const match = tags.get(subtags.slice(0, count).join('-'));
      if (match !== undefined) {
        if (!chain.includes(match)) chain.push(match);
        break;
      }
    }
  }
  return chain;
}

export class Catalog {
  private readonly formats = new Map<string, MessageFormat>();

  constructor(
    private readonly catalogs: Catalogs,
    readonly languages: readonly string[],
    private readonly onFailure: OnFailure,
  ) {}

  /** Message `id` with `values`, in the first of the languages that formats it without error. */
  text(id: string, values: Values = {}): string {
    for (const language of this.languages) {
      const source = this.catalogs[language]?.[id];
      if (source === undefined) continue;
      let failed = false;
      try {
        const text = this.format(language, id, source).format({ ...values }, () => {
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

  private format(language: string, id: string, source: string): MessageFormat {
    const key = `${language}\n${id}`;
    let format = this.formats.get(key);
    if (format === undefined) {
      format = new MessageFormat(language, source);
      this.formats.set(key, format);
    }
    return format;
  }
}

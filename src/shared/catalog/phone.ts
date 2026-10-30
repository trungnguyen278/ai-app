// SPDX-License-Identifier: MIT
import { getLocales } from 'expo-localization';

import { Catalog, languageChain } from './catalog';
import { CATALOGS } from './locales';

/** The app's catalog, in the languages the phone prefers (ADR-0002), then English. */
export function phoneCatalog(): Catalog {
  const preferred = getLocales().map((locale) => locale.languageTag);
  const languages = languageChain(preferred, Object.keys(CATALOGS));
  return new Catalog(CATALOGS, languages, (id, language) => {
    console.warn(`catalog: message ${id} did not format in ${language}`);
  });
}

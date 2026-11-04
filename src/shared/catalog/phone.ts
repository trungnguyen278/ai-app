// SPDX-License-Identifier: MIT
import { getLocales } from 'expo-localization';

import { Catalog } from './catalog';
import { CATALOGS } from './locales';

/**
 * The app's catalog, in the languages the phone prefers (ADR-0002), then English, with the
 * phone's own conventions for dates and numbers.
 */
export function phoneCatalog(): Catalog {
  const preferred = getLocales().map((locale) => locale.languageTag);
  return new Catalog(CATALOGS, preferred, (id, language) => {
    console.warn(`catalog: message ${id} did not format in ${language}`);
  });
}

// SPDX-License-Identifier: MIT
// What a new home starts with, from the phone that creates it, as Apple's Home takes the home's
// place from the phone (the app API, Creating a home: "with the phone's time zone and languages to
// start from").
import { getCalendars, getLocales } from 'expo-localization';

import { SOURCE } from '@/src/shared/catalog';
import { accepts } from '@/src/shared/protocols';

// Fixed by the app API's schema: $defs/home_languages, maxItems.
const LANGUAGES_MAX = 10;
// When the phone does not say: Coordinated Universal Time, by its IANA name.
const UNKNOWN_TIME_ZONE = 'UTC';

/** The phone's IANA time zone, as the app API takes one; UTC when the phone does not say. */
export function phoneTimeZone(): string {
  const zone = getCalendars()[0]?.timeZone;
  return zone !== null && zone !== undefined && accepts('time_zone', zone)
    ? zone
    : UNKNOWN_TIME_ZONE;
}

/**
 * The phone's languages, most preferred first, as the app API takes them: at least one, the
 * catalogs' source when the phone gives none it can take.
 */
export function phoneLanguages(): string[] {
  const tags: string[] = [];
  for (const { languageTag } of getLocales()) {
    if (accepts('language', languageTag) && !tags.includes(languageTag)) tags.push(languageTag);
  }
  return tags.length > 0 ? tags.slice(0, LANGUAGES_MAX) : [SOURCE];
}

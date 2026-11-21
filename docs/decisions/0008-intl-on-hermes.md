# 0008 — Intl on Hermes: FormatJS's polyfills, loaded by the catalogs

- **Status:** Accepted (delegated to the developer, 2026-11-21)
- **Date:** 2026-11-21

## Context

- **The app's texts are MessageFormat 2 messages,** formatted by messageformat 4.1.0 with the functions that dates need (ai-platform's [ADR-0007](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0007-catalogs.md); `src/shared/catalog`).
- **On a phone, the app runs on Hermes V1,** `hermes-v260318099.0.5`, which React Native 0.88.1 ships (`sdks/.hermesv1version`) and no longer lets an app turn off (its Gradle plugin, `ReactPlugin.kt`). React Native builds it with Intl on both platforms (`HERMES_ENABLE_INTL`, in `ReactAndroid/hermes-engine/build.gradle.kts` and `sdks/hermes-engine/utils/build-apple-framework.sh`).
- **Hermes builds only part of Intl,** over the platform's own libraries: ICU4J on Android, Foundation on iOS. At that tag, `createIntlObject` (`lib/VM/JSLib/Intl.cpp`) defines `getCanonicalLocales`, `Collator`, `DateTimeFormat` and `NumberFormat`, and nothing else. `NumberFormat`'s `formatToParts` exists only where `__APPLE__` is not defined, and `PlatformIntlApple.mm` leaves it unimplemented. Hermes's main branch is the same, and its `doc/IntlAPIs.md` agrees (all read 2026-11-21).
- **What the app and its libraries call,** read from an export of the Android bundle (2026-11-21):
  - messageformat: `new Intl.Locale` for each locale of each message, in its constructor, and for a value's direction (`dir-utils.js`: `getTextInfo`, `maximize`); `Intl.PluralRules` to choose a numeric variant; `Intl.NumberFormat`'s `format`, `resolvedOptions` and `supportedLocalesOf`, and `Intl.DateTimeFormat`'s `format` and `resolvedOptions`; `formatToParts` of both only in its own `formatToParts`, which the app does not call; `String.prototype.normalize`.
  - The app: `Intl.getCanonicalLocales` (the catalogs), `Intl.DateTimeFormat` with a `timeZone` (the simulated cloud and device), `toLocaleUpperCase`.
  - Other libraries: `localeCompare` (Expo Router, React Navigation, React Native's `URLSearchParams`) and `toLocaleLowerCase`, which Hermes has.
- **So every message failed on a phone,** in messageformat's constructor, and the app showed each message's ID: found on an Android 17 phone on 2026-11-21 ([dev log](../devlog/2026-11.md)). Jest runs on Node, whose Intl is whole, and saw nothing. Hermes lacks `Intl.PluralRules` too, which the first plural would need.
- **FormatJS's runtime requirements** (read 2026-11-21) recommend, for Hermes, its native Hermes Intl SDK, else its TypeScript polyfills, in this order: `getCanonicalLocales`, `Locale`, `PluralRules`, `NumberFormat`, `DateTimeFormat`. Its guide for React Native and Hermes loads each through its `shouldPolyfill` check; it says Hermes has `Locale` and `PluralRules`, which Hermes's source, above, does not. Expo's localization guide says that with Hermes "you can use the Intl API on all platforms", and names no part missing.

## Decision

FormatJS's polyfills of the parts of Intl that messageformat needs and Hermes lacks: `@formatjs/intl-getcanonicallocales` 3.4.0, `@formatjs/intl-locale` 5.5.0 and `@formatjs/intl-pluralrules` 7.1.0, with the plural rules of each catalog's language, each pinned to its exact version.

- **The catalogs load them** (`src/shared/catalog/intl.ts`, which `catalog.ts` imports first): what formats loads what it needs, before any message is made, on a phone and in the tests alike. They load in FormatJS's order.
- **Each installs itself where FormatJS's own check finds the engine's missing or behind the standard** (each package's `polyfill.js`). Node 24's are behind too, by those checks (2026-11-21), so Jest runs the `getCanonicalLocales`, `Locale` and `PluralRules` that phones run.
- **`getCanonicalLocales` too, though Hermes has one:** FormatJS's `Locale` canonicalizes through the global one, and requires it first. Its polyfill installs itself where the engine's fails FormatJS's three tags of UTS #35's canonical form (`should-polyfill.js`). Node's fails it: `en-u-aa-yes` loses its `yes`, which a key keeps unless CLDR makes it an alias of `true`. Hermes's was not tried on a phone; a test checks that the one the phone's catalogs get keeps it.
- **Hermes's `DateTimeFormat` and `NumberFormat` stay:** messageformat calls only what Hermes has of them, and they format with the phone's own data.
- **The plural rules of each language,** one import of FormatJS's `locale-data/<tag>.js` for each catalog, which a test checks.
- **What Hermes lacks cannot come back unseen:**
  - `tests/hermes.ts` builds Intl as Hermes does on Android and on iOS, from Node's: Hermes's constructors and their methods, and nothing else. A test loads the catalogs anew with it and formats every message of every catalog, which must give the text it gives on Node. Without the polyfills, it fails.
  - ESLint refuses, in `app/` and `src/`, what Hermes lacks: `Intl.DisplayNames`, `DurationFormat`, `ListFormat`, `RelativeTimeFormat`, `Segmenter` and `supportedValuesOf`; `Intl.Locale` and `Intl.PluralRules`, which only the catalogs polyfill; and `formatToParts`, which Hermes lacks for numbers on iOS.

## Alternatives considered

| Alternative | Why not |
|---|---|
| FormatJS's native Hermes Intl SDK | C++ and Rust, linked into the app's native target with CMake and installed by a C++ call before the bundle loads: a step that neither React Native nor Expo's config plugins offer. It replaces all of Hermes's Intl, with a `DateTimeFormat` that knows UTC alone until time zones' data is added (its guide, 2026-11-21). Its first release was on 2026-10-30, and its 2.0.0 on 2026-11-19. |
| A Hermes with all of Intl | None is built: Hermes's main branch defines the same four (2026-11-21), and React Native ships its own Hermes. |
| Another engine: JavaScriptCore, from `@react-native-community/javascriptcore` 0.2.0 | It replaces the engine under React Native and every Expo module, which are built and tested for Hermes, with native changes on both platforms, to gain two parts of Intl. |
| messageformat changed not to need `Intl.Locale` | A patch of a library, to keep at each of its releases; and plurals would still need `Intl.PluralRules`. |
| The polyfills at the app's entry | Expo Router's entry is its own, and a module that formats would rely on another having loaded first; the tests that format would need it too. |
| Every FormatJS polyfill, `NumberFormat` and `DateTimeFormat` too | Hermes has what messageformat calls of them; theirs would replace the phone's own formats, with data for each locale and time zone in the bundle. |

## Consequences

- Positive: every text formats on a phone, and messages may choose plurals. Jest and phones run the same `Locale` and `PluralRules`, and a test runs the catalogs on Hermes's Intl.
- Negative / accepted trade-offs:
  - The bundle grows by about 0.45 MB of JavaScript, minified, and 0.16 MB compressed with gzip (an Android export with and without them, 2026-11-21).
  - Plurals follow FormatJS's data, not the phone's: 7.1.0 has CLDR 49's rules, in which Vietnamese has `one` for 0 and 1 (`i = 0 or n = 1`), where CLDR 48, Node 24's, had `other` alone (CLDR's `plurals.xml`, `release-48` and `release-49`).
  - Hermes's own limits stay (its `IntlAPIs.md`): on iOS, `NumberFormat` has no `signDisplay` and no compact or engineering notation; on Android, `DateTimeFormat` has no `dayPeriod` and no `fractionalSecondDigits`. A message's options stay within them, which `tests/hermes.ts` does not check: it copies Hermes's methods, not its options.
- Follow-up: each move of React Native, or of the polyfills, reads Hermes's `Intl.cpp` again and updates `tests/hermes.ts` (the review checklist).

## References

- Hermes: [`lib/VM/JSLib/Intl.cpp`](https://github.com/facebook/hermes/blob/hermes-v260318099.0.5/lib/VM/JSLib/Intl.cpp), [`lib/Platform/Intl/PlatformIntlApple.mm`](https://github.com/facebook/hermes/blob/hermes-v260318099.0.5/lib/Platform/Intl/PlatformIntlApple.mm) and [`doc/IntlAPIs.md`](https://github.com/facebook/hermes/blob/hermes-v260318099.0.5/doc/IntlAPIs.md), at `hermes-v260318099.0.5`; read 2026-11-21.
- FormatJS: [Runtime requirements](https://formatjs.github.io/docs/guides/runtime-requirements/), [React Native and Hermes](https://formatjs.github.io/docs/guides/react-native-hermes), [Hermes Intl](https://formatjs.github.io/docs/guides/hermes-intl); read 2026-11-21.
- Expo: [Localization](https://docs.expo.dev/guides/localization/); read 2026-11-21.
- Unicode CLDR: [`common/supplemental/plurals.xml`](https://github.com/unicode-org/cldr/blob/release-49/common/supplemental/plurals.xml), releases 48 and 49.
- messageformat 4.1.0: `lib/messageformat.js`, `lib/dir-utils.js`, `lib/functions/number.js` and `datetime.js`.
- ai-platform [ADR-0007](https://github.com/trungnguyen278/ai-platform/blob/main/docs/decisions/0007-catalogs.md), the catalogs, which foresaw polyfills on Hermes.

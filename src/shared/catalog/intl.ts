// SPDX-License-Identifier: MIT
// What MessageFormat 2 asks of Intl that Hermes lacks, from FormatJS's polyfills (ADR-0008).
// Hermes builds Intl with getCanonicalLocales, Collator, DateTimeFormat and NumberFormat alone
// (its `lib/VM/JSLib/Intl.cpp`, at the version React Native 0.88 runs), while messageformat makes
// an Intl.Locale for every message and chooses a plural's variant by Intl.PluralRules.
//
// Each polyfill installs itself where FormatJS's own check finds the engine's missing or behind
// the standard, which Node's is too: Jest runs the code that the phone runs. They load in the
// order FormatJS's runtime requirements give, each after those it needs.
import '@formatjs/intl-getcanonicallocales/polyfill.js';
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill.js';
// The plural rules of each catalog's language (locales.ts), which a test checks against them.
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/vi.js';

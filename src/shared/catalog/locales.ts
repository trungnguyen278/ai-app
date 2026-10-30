// SPDX-License-Identifier: MIT
// The app's catalogs, one file per language in locales/ (ADR-0007). The bundler packs only
// what is imported, so each language's file is listed here, and a test checks this list
// against the folder.
import en from '@/locales/en.json';
import vi from '@/locales/vi.json';

import type { Catalogs } from './catalog';

export const CATALOGS: Catalogs = { en, vi };

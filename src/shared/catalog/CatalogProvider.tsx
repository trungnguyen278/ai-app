// SPDX-License-Identifier: MIT
import { createContext, useContext, type ReactNode } from 'react';

import type { Catalog, Values } from './catalog';

const CatalogContext = createContext<Catalog | null>(null);

/** Gives the screens beneath it the texts of `catalog`. */
export function CatalogProvider({ catalog, children }: { catalog: Catalog; children: ReactNode }) {
  return <CatalogContext value={catalog}>{children}</CatalogContext>;
}

/** A function that gives a message's text in the owner's language. */
export function useText(): (id: string, values?: Values) => string {
  const catalog = useCatalog('useText');
  return (id, values) => catalog.text(id, values);
}

/**
 * The same, without the marks that isolate values, for text that becomes data: a default the
 * person may keep, such as a home's name.
 */
export function usePlainText(): (id: string, values?: Values) => string {
  const catalog = useCatalog('usePlainText');
  return (id, values) => catalog.plainText(id, values);
}

function useCatalog(hook: string): Catalog {
  const catalog = useContext(CatalogContext);
  if (catalog === null) {
    throw new Error(`${hook} needs a CatalogProvider above it`);
  }
  return catalog;
}

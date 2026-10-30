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
  const catalog = useContext(CatalogContext);
  if (catalog === null) {
    throw new Error('useText needs a CatalogProvider above it');
  }
  return (id, values) => catalog.text(id, values);
}

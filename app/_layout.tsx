// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { CatalogProvider, phoneCatalog } from '@/src/shared/catalog';

/** The app's root: every screen gets the texts of the phone's languages. */
export default function RootLayout() {
  const catalog = useMemo(() => phoneCatalog(), []);
  return (
    <CatalogProvider catalog={catalog}>
      <Stack />
    </CatalogProvider>
  );
}

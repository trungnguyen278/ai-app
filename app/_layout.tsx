// SPDX-License-Identifier: MIT
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo } from 'react';

import { CatalogProvider, phoneCatalog } from '@/src/shared/catalog';
import { runtimeSettings } from '@/src/shared/config';
import { DesignProvider, FONT_FILES } from '@/src/shared/design';

// The splash screen stays until the fonts are in, then fades.
void SplashScreen.preventAutoHideAsync();
SplashScreen.setOptions({ fade: true });

/**
 * The app's root: every screen gets the texts of the phone's languages and the theme. The
 * studio's pages open in the development app only (ADR-0003).
 */
export default function RootLayout() {
  const catalog = useMemo(() => phoneCatalog(), []);
  const [loaded, failed] = useFonts(FONT_FILES);
  const ready = loaded || failed !== null;
  useEffect(() => {
    if (failed !== null) {
      console.warn('fonts: Be Vietnam Pro did not load, and the system font stands in');
    }
    if (ready) {
      void SplashScreen.hideAsync();
    }
  }, [ready, failed]);
  if (!ready) {
    return null;
  }
  return (
    <CatalogProvider catalog={catalog}>
      <DesignProvider>
        <Stack>
          <Stack.Protected guard={runtimeSettings().studio}>
            <Stack.Screen name="studio/index" />
            <Stack.Screen name="studio/colors" />
            <Stack.Screen name="studio/type" />
            <Stack.Screen name="studio/layout" />
          </Stack.Protected>
        </Stack>
      </DesignProvider>
    </CatalogProvider>
  );
}

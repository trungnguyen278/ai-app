// SPDX-License-Identifier: MIT
import { QueryClientProvider } from '@tanstack/react-query';
import { isRunningInExpoGo } from 'expo';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';

import { AccountProvider, useSession } from '@/src/account';
import { CatalogProvider, phoneCatalog } from '@/src/shared/catalog';
import { runtimeSettings } from '@/src/shared/config';
import { DesignProvider, FONT_FILES } from '@/src/shared/design';
import { followTheApp, newQueryClient } from '@/src/shared/queries';

// The splash screen stays until the fonts are in and the session is known, then fades. Expo Go
// keeps its own splash screen, whose options the app cannot set.
void SplashScreen.preventAutoHideAsync();
if (!isRunningInExpoGo()) {
  SplashScreen.setOptions({ fade: true });
}

/**
 * The app's root: every screen gets the cloud's cache, the session, the texts of the phone's
 * languages and the theme.
 */
export default function RootLayout() {
  const catalog = useMemo(() => phoneCatalog(), []);
  const [queries] = useState(() => newQueryClient(runtimeSettings().queries));
  const [loaded, failed] = useFonts(FONT_FILES);
  useEffect(() => {
    if (failed !== null) {
      console.warn('fonts: Be Vietnam Pro did not load, and the system font stands in');
    }
  }, [failed]);
  useEffect(() => followTheApp(), []);
  if (!loaded && failed === null) {
    return null;
  }
  return (
    <QueryClientProvider client={queries}>
      <AccountProvider>
        <CatalogProvider catalog={catalog}>
          <DesignProvider>
            <Routes />
          </DesignProvider>
        </CatalogProvider>
      </AccountProvider>
    </QueryClientProvider>
  );
}

/**
 * The routes the session allows: the homes and the account once signed in, signing in until
 * then (Expo Router's protected routes). The studio's pages open in the development app only
 * (ADR-0003), signed in or not.
 */
function Routes() {
  const { state } = useSession();
  const known = state.status !== 'restoring';
  const signedIn = state.status === 'signedIn';
  useEffect(() => {
    if (known) {
      void SplashScreen.hideAsync();
    }
  }, [known]);
  if (!known) {
    return null;
  }
  return (
    <Stack>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="account" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={runtimeSettings().studio}>
        <Stack.Screen name="studio/index" />
        <Stack.Screen name="studio/colors" />
        <Stack.Screen name="studio/type" />
        <Stack.Screen name="studio/layout" />
        <Stack.Screen name="studio/components" />
        <Stack.Screen name="studio/motion" />
      </Stack.Protected>
    </Stack>
  );
}

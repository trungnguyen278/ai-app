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
 * then (Expo Router's protected routes). An invitation's link opens either way, and signs the
 * person in on its own screen, which keeps its place. The studio's pages open in the development
 * app only (ADR-0003), signed in or not.
 *
 * Each guard names where it leads. Without one, Expo Router leads to the first route open,
 * in its own order of the routes, by name, which would make the invitation's screen the start
 * of every person signed out.
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
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
        <Stack.Screen name="index" />
        <Stack.Screen name="homes/index" />
        <Stack.Screen name="homes/new" />
        <Stack.Screen name="homes/[id]/index" />
        <Stack.Screen name="homes/[id]/invite" />
        <Stack.Screen name="homes/[id]/profiles/new" />
        <Stack.Screen name="homes/[id]/people/[memberId]" />
        <Stack.Screen name="homes/[id]/devices/[deviceId]" />
        <Stack.Screen name="account" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Screen name="join" />
      <Stack.Protected guard={runtimeSettings().studio} redirectTo="/">
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

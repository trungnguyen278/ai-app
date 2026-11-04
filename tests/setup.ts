// SPDX-License-Identifier: MIT
// Every test starts in Reanimated's test mode, with Skia's stand-in (mocks/skia.tsx), Node's
// crypto for the phone's, and the settings that a build of the development app has
// (app.config.ts puts them in Expo's `extra`).
import Constants from 'expo-constants';
import { setUpTests } from 'react-native-reanimated';

import { loadSettings, runtimeSettings } from '@/app.config';

jest.mock('@shopify/react-native-skia', () => jest.requireActual('./mocks/skia'));

// expo-crypto's native module is absent in Node, where jest-expo's stand-in returns nothing.
// Node's crypto gives what the phone's does: random UUIDs, and bytes from a cryptographic source.
jest.mock('expo-crypto', () => {
  const crypto = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return {
    ...jest.requireActual('expo-crypto'),
    randomUUID: () => crypto.randomUUID(),
    getRandomValues: (array: Uint8Array) => crypto.webcrypto.getRandomValues(array),
  };
});

// Fonts cannot load in Node, so the tests start with them in, as a phone does once they are.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

setUpTests();

Object.assign(Constants.expoConfig ?? {}, {
  extra: { settings: runtimeSettings(loadSettings('development')) },
});

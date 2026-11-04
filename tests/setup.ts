// SPDX-License-Identifier: MIT
// Every test starts in Reanimated's test mode, with Skia's stand-in (mocks/skia.tsx), Node's
// crypto for the phone's, and the settings that a build of the development app has
// (app.config.ts puts them in Expo's `extra`).
import Constants, { ExecutionEnvironment } from 'expo-constants';
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

// The phone is online in the tests: jest-expo's stand-in for expo-network returns nothing.
jest.mock('expo-network', () => ({
  ...jest.requireActual('expo-network'),
  addNetworkStateListener: () => ({ remove: () => {} }),
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
}));

setUpTests();

// The tests run as a build of the development app, not as Expo Go: its own links start with its
// scheme (expo-linking's createURL). Its settings are the development app's, but for the
// simulated cloud's pace: the tests do not wait.
Object.assign(Constants, { executionEnvironment: ExecutionEnvironment.Bare });
const loaded = loadSettings('development');
const settings = runtimeSettings(loaded);
Object.assign(Constants.expoConfig ?? {}, {
  scheme: loaded.app.scheme,
  extra: {
    settings: {
      ...settings,
      cloud: { ...settings.cloud, simulated: { ...settings.cloud.simulated, latency: 0 } },
    },
  },
});

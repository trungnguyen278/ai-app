// SPDX-License-Identifier: MIT
// Every test starts in Reanimated's test mode, with Skia's stand-in (mocks/skia.tsx), and with
// the settings that a build of the development app has (app.config.ts puts them in Expo's
// `extra`).
import Constants from 'expo-constants';
import { setUpTests } from 'react-native-reanimated';

import { loadSettings, runtimeSettings } from '@/app.config';

jest.mock('@shopify/react-native-skia', () => jest.requireActual('./mocks/skia'));

// Fonts cannot load in Node, so the tests start with them in, as a phone does once they are.
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  useFonts: () => [true, null],
}));

setUpTests();

Object.assign(Constants.expoConfig ?? {}, {
  extra: { settings: runtimeSettings(loadSettings('development')) },
});

// SPDX-License-Identifier: MIT
import Constants from 'expo-constants';

import { runtimeSettings } from '@/src/shared/config';

test('the app reads the settings built into it', () => {
  // tests/setup.ts builds them as the development app has them.
  expect(runtimeSettings()).toEqual({ studio: true });
});

test('an app built without its settings stops at once', () => {
  const expo = Constants.expoConfig!;
  const extra = expo.extra;
  expo.extra = {};
  try {
    expect(() => runtimeSettings()).toThrow('the app was built without its settings');
  } finally {
    expo.extra = extra;
  }
});

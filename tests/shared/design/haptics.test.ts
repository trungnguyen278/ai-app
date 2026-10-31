// SPDX-License-Identifier: MIT
import {
  AndroidHaptics,
  NotificationFeedbackType,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from 'expo-haptics';
import { Platform } from 'react-native';

import { haptic } from '@/src/shared/design';

jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  performAndroidHapticsAsync: jest.fn(async () => {}),
}));

beforeEach(() => jest.clearAllMocks());

describe('on iOS', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
  });

  test('a choice plays the selection generator', () => {
    haptic('select');
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['success', NotificationFeedbackType.Success],
    ['error', NotificationFeedbackType.Error],
  ] as const)('%s plays its notification', (role, type) => {
    haptic(role);
    expect(notificationAsync).toHaveBeenCalledWith(type);
    expect(performAndroidHapticsAsync).not.toHaveBeenCalled();
  });
});

describe('on Android', () => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'android');
  });

  test.each([
    ['select', AndroidHaptics.Segment_Tick],
    ['success', AndroidHaptics.Confirm],
    ['error', AndroidHaptics.Reject],
  ] as const)("%s plays the haptics engine's %s, never the vibrator", (role, type) => {
    haptic(role);
    expect(performAndroidHapticsAsync).toHaveBeenCalledWith(type);
    expect(selectionAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
  });
});

test('a phone that cannot play a haptic carries on', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  jest.mocked(selectionAsync).mockRejectedValueOnce(new Error('no haptics here'));
  expect(() => haptic('select')).not.toThrow();
  // The refusal is caught, so it never surfaces as an unhandled rejection.
  await new Promise((resolve) => setImmediate(resolve));
});

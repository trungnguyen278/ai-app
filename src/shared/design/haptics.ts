// SPDX-License-Identifier: MIT
// Haptics (ADR-0003): one for what a touch does, where the platforms' guidance puts one, and
// never the only sign of it. Each platform's own haptics engine plays them, and so follows the
// phone's setting for them.
import {
  AndroidHaptics,
  NotificationFeedbackType,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * What a haptic says:
 * - `select`: a choice among a few moves to another, as in a segmented control or a picker;
 * - `success`, `error`: something that took a while has ended, well or not.
 */
export type HapticRole = 'select' | 'success' | 'error';

/**
 * Each role on each platform. iOS has its feedback generators. Android plays
 * `performHapticFeedback`'s constants, not the vibrator, which expo-haptics advises against.
 */
export const HAPTICS: Record<HapticRole, { ios: () => Promise<void>; android: AndroidHaptics }> = {
  select: { ios: () => selectionAsync(), android: AndroidHaptics.Segment_Tick },
  success: {
    ios: () => notificationAsync(NotificationFeedbackType.Success),
    android: AndroidHaptics.Confirm,
  },
  error: {
    ios: () => notificationAsync(NotificationFeedbackType.Error),
    android: AndroidHaptics.Reject,
  },
};

/** Plays `role`'s haptic, in the same frame as what it goes with. */
export function haptic(role: HapticRole): void {
  const { ios, android } = HAPTICS[role];
  const played = Platform.OS === 'android' ? performAndroidHapticsAsync(android) : ios();
  // A phone that cannot play it simply does not: the touch has its visible answer anyway.
  played.catch(() => {});
}

// SPDX-License-Identifier: MIT
import { useEffect, useLayoutEffect, useState } from 'react';
import { Platform } from 'react-native';

import { announce, type NoticeRole } from '../announce';
import { Text, type TextProps } from './Text';

// A live region's mode for each role: WAI-ARIA gives `alert` an assertive one, and `status` a
// polite one; Android's modes are the same two (`View.ACCESSIBILITY_LIVE_REGION_*`).
const LIVE: Readonly<Record<NoticeRole, 'assertive' | 'polite'>> = {
  alert: 'assertive',
  status: 'polite',
};

export interface NoticeProps extends Omit<
  TextProps,
  'children' | 'role' | 'accessibilityRole' | 'aria-live' | 'accessibilityLiveRegion'
> {
  /** `alert` for what went wrong, said at once; `status` for news, said when the reader is free. */
  role: NoticeRole;
  /** What is shown, and said, as the catalog wrote it. */
  children: string;
}

/**
 * A message that appears, or changes, where people look for it, such as a failure or what a
 * change did. Screen readers say it as it comes and as its text or role changes, never again for a
 * mere render; to say the same text again for a new event, give the notice a new `key`. Each
 * platform says it its own way:
 * - Android, and the web, speak the changes of a live region. Android speaks a region that is
 *   already on the screen when its text changes, not one that arrives with its text (`View`'s
 *   `notifyViewAccessibilityStateChangedIfNeeded`), and the web the same: so the region comes
 *   first, empty, and its text right after.
 * - iOS has no live regions: the text is announced.
 */
export function Notice({ role, children, ...props }: NoticeProps) {
  const [filled, setFilled] = useState(Platform.OS === 'ios');
  // The second render is the point: the empty region is committed, and mounted, before its text.
  // Android mounts each commit apart (React Native 0.88 pushes each transaction as it commits,
  // `enableMountingCoordinatorPullModelAndroid` being off), and a layout effect's render comes
  // before the screen is drawn, as React's own measuring example does.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => setFilled(true), []);
  useEffect(() => {
    if (Platform.OS === 'ios') announce(children, role);
  }, [children, role]);
  // React Native's Text reads `accessibilityLiveRegion`, and drops `aria-live`, which only its
  // View maps; React Native for Web reads `aria-live`, and calls the other deprecated.
  const live =
    Platform.OS === 'android'
      ? { accessibilityLiveRegion: LIVE[role] }
      : Platform.OS === 'web'
        ? { 'aria-live': LIVE[role] }
        : {};
  return (
    <Text role={role} {...live} {...props}>
      {filled ? children : null}
    </Text>
  );
}

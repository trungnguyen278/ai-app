// SPDX-License-Identifier: MIT
import { AccessibilityInfo } from 'react-native';

/**
 * How urgent a message is, named after WAI-ARIA's roles: an `alert` is said at once, a `status`
 * when the screen reader is free.
 */
export type NoticeRole = 'alert' | 'status';

type Speech = { queue?: boolean; priority?: 'low' | 'default' | 'high' };

/**
 * VoiceOver's speech for each role, as TalkBack speaks a live region (its
 * `EventTypeWindowContentChangedFeedbackRule`): an alert interrupts what is being said, and is not
 * cut off once it starts (`UIAccessibilityPriority.high`, iOS 17 and later; before it, the
 * announcement interrupts and nothing more); a status waits behind what is being said
 * (`UIAccessibilitySpeechAttributeQueueAnnouncement`).
 */
const SPEECH: Readonly<Record<NoticeRole, Speech>> = {
  alert: { priority: 'high' },
  status: { queue: true },
};

// Messages that come together, as two failures do in one render, are said one after the other,
// in the order they came: the first as its role asks, and each after it queued behind it.
let together = false;

/**
 * Says a message with VoiceOver. iOS has no live regions: an announcement is its one way to
 * speak a text that appears or changes (`UIAccessibility.Notification.announcement`).
 */
export function announce(message: string, role: NoticeRole): void {
  AccessibilityInfo.announceForAccessibilityWithOptions(
    message,
    together ? { ...SPEECH[role], queue: true } : SPEECH[role],
  );
  if (!together) {
    together = true;
    queueMicrotask(() => {
      together = false;
    });
  }
}

// SPDX-License-Identifier: MIT
// Motion (ADR-0003, decision 5): its curves and durations, by role.
import type { TextStyle, ViewStyle } from 'react-native';
import { cubicBezier, type CSSTransitionProperties } from 'react-native-reanimated';

/**
 * The curves, as cubic Béziers, from Expo's animation skill, written with Emil Kowalski: a
 * strong ease-out for what enters or leaves, an ease-in-out for what moves or changes on screen.
 * No curve eases in: it would hold back the very moment someone watches.
 */
export const CURVES = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
} as const;

/**
 * A change of tone: the app's colours blend as the robot's face does from one expression to
 * the next, in 0.28 s (ai-robot's ui/src/settings.js, `transition`).
 */
export const TONE_BLEND = {
  duration: 280,
  easing: cubicBezier(...CURVES.inOut),
};

/** The style that blends text's colour with the tone, on the UI thread: for an Animated.Text. */
export const TEXT_BLEND: CSSTransitionProperties<TextStyle> = {
  transitionProperty: 'color',
  transitionDuration: TONE_BLEND.duration,
  transitionTimingFunction: TONE_BLEND.easing,
};

/** The style that blends a view's colours with the tone, on the UI thread: for an Animated.View. */
export const VIEW_BLEND: CSSTransitionProperties<ViewStyle> = {
  transitionProperty: ['backgroundColor', 'borderColor'],
  transitionDuration: TONE_BLEND.duration,
  transitionTimingFunction: TONE_BLEND.easing,
};

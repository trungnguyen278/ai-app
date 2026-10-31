// SPDX-License-Identifier: MIT
// Motion (ADR-0003, decision 5): its curves, durations and distances, by role. What is touched
// often moves least: Expo's animation skill, written with Emil Kowalski, sets the budget.
import type { TextStyle, ViewStyle } from 'react-native';
import { cubicBezier, Easing, linear, type CSSTransitionProperties } from 'react-native-reanimated';

import { SPACE } from './layout';

/**
 * The curves, as cubic Béziers, from Expo's animation skill: a strong ease-out for what enters
 * or leaves, an ease-in-out for what moves or changes on screen. No curve eases in: it would
 * hold back the very moment someone watches.
 */
export const CURVES = {
  out: [0.23, 1, 0.32, 1],
  inOut: [0.77, 0, 0.175, 1],
} as const;

/** The curves for Reanimated's CSS transitions and animations. */
export const CSS_CURVE = {
  out: cubicBezier(...CURVES.out),
  inOut: cubicBezier(...CURVES.inOut),
};

/** The same curves for Reanimated's timings and keyframes. */
export const EASE = {
  out: Easing.bezier(...CURVES.out),
  inOut: Easing.bezier(...CURVES.inOut),
};

// u = ωT for which a critically damped spring has come 99.9 % of the way: (1 + u)·e^(−u) = 0.001.
const SETTLED = 9.2334;
// Points along the curve: enough that the straight lines between them read as a curve.
const SAMPLES = 24;

/**
 * A touch answers with a spring that does not bounce (ADR-0003): a critically damped oscillator
 * on its way home, x = 1 − (1 + ωt)·e^(−ωt), sampled along the transition's time so that a CSS
 * transition can play it on the UI thread.
 */
export const SPRING_CURVE = Array.from({ length: SAMPLES + 1 }, (_, step) => {
  const u = (SETTLED * step) / SAMPLES;
  return step === SAMPLES ? 1 : 1 - (1 + u) * Math.exp(-u);
});

/** The spring, as a timing function for Reanimated's CSS transitions. */
export const CSS_SPRING = linear(...SPRING_CURVE);

/**
 * How long each kind of motion takes, in ms. A press, touched tens of times a day, stays under
 * 150; nothing passes 300. What leaves goes a fifth faster than it came.
 */
export const DURATION = {
  /** A press. */
  press: 120,
  /** A small change of state: a toggle, a chip, a row that moves aside. */
  change: 180,
  /** Something arriving. */
  enter: 250,
  /** Something leaving. */
  exit: 200,
  /** With reduce motion on, what would move or scale fades instead, in this time. */
  fade: 150,
} as const;

/** A press shrinks what is pressed a little; with reduce motion on, it dims it instead. */
export const PRESS = { scale: 0.97, opacity: 0.7 } as const;

/** What enters rises from a little below and from a little smaller, never from nothing. */
export const ENTER = { rise: SPACE.md, scale: 0.96 } as const;

/** The time between items entering one after another. */
export const STAGGER = 40;

/**
 * Light breathes as the robot's face does, once every 4.4 s, on a sine (ai-robot's
 * ui/src/settings.js, `breathe.period`). A glow is softer than an eye, so it swells further.
 */
export const BREATH = {
  period: 4400,
  scale: [0.94, 1.06],
  opacity: [0.75, 1],
} as const;

/** Waiting is never blank: a shape still loading shimmers, and the tone pulses. */
export const WAIT = {
  /** One sweep of the shimmer across a shape. */
  shimmer: 1400,
  /** One pulse of the tone. */
  pulse: 1200,
  /** Between the pulses of neighbouring dots. */
  ripple: 160,
} as const;

/**
 * A change of tone: the app's colours blend as the robot's face does from one expression to
 * the next, in 0.28 s (ai-robot's ui/src/settings.js, `transition`).
 */
export const TONE_BLEND = {
  duration: 280,
  easing: CSS_CURVE.inOut,
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

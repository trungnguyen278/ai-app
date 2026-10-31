// SPDX-License-Identifier: MIT
// Space and corners (ADR-0003).

/** Spacing, on a grid of 4, named by size: row gaps are smaller than group gaps, and so on up. */
export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** The space between a screen's edges and its content. */
export const GUTTER = SPACE.lg;

/**
 * The least size of what a finger presses: Android's 48 dp, which covers Apple's 44 pt too
 * (Material Design's touch targets; the Human Interface Guidelines' hit targets).
 */
export const TARGET = 48;

/** The width of the ring around what is chosen or has focus. */
export const RING_WIDTH = 2;

/** How far light glows around what gives it off, as a blur radius. */
export const GLOW_RADIUS = {
  sm: 8,
  md: 16,
  lg: 32,
} as const;

/** The light of a rare moment, such as a first screen with nothing on it yet: its size. */
export const HERO = 240;

/** Corners, round and soft as the robot's face is. Each is drawn with a continuous curve. */
export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 22,
  full: 9999,
} as const;

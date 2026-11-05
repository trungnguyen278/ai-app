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

/** A person's disc, in a header or a row: smaller than a finger, which its hitSlop makes up. */
export const AVATAR = 32;

/** The width of the ring around what is chosen or has focus. */
export const RING_WIDTH = 2;

/**
 * The mark beside each option of a choice (`ChoiceList`), in a square `size` across, as each
 * platform marks the option chosen:
 * - on Android, a radio button: a ring RING_WIDTH wide and, when chosen, a dot `dot` across, as
 *   Compose's Material 3 RadioButton draws one (20 dp, a 2 dp ring, a 12 dp dot);
 * - on iOS, a checkmark RING_WIDTH thick, through `check`'s points, as parts of the square: the
 *   end of its short arm, its corner, then the end of its long arm.
 */
export const MARK = {
  size: 20,
  dot: 12,
  check: [
    [0.18, 0.5],
    [0.4, 0.73],
    [0.82, 0.22],
  ],
} as const;

/** How far light glows around what gives it off, as a blur radius. */
export const GLOW_RADIUS = {
  sm: 8,
  md: 16,
  lg: 32,
} as const;

/** The light of a rare moment, such as a first screen with nothing on it yet: its size. */
export const HERO = 240;

/**
 * A QR code's side, at most, for another phone to read from this one: an invitation's link,
 * with its quiet zone, is 45 modules, which this gives 5 points each.
 */
export const CODE_SIZE = 240;

/** Corners, round and soft as the robot's face is. Each is drawn with a continuous curve. */
export const RADIUS = {
  sm: 8,
  md: 14,
  lg: 22,
  full: 9999,
} as const;

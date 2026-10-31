// SPDX-License-Identifier: MIT
// The design system (ADR-0003, docs/design.md): what other modules may import of it.
export {
  COMPONENT_CONTRAST,
  contrast,
  isHex,
  leastContrast,
  TEXT_CONTRAST,
  withOpacity,
} from './color';
export { Appear, enterFrames, exitFrames } from './components/Appear';
export type { AppearProps, Frames } from './components/Appear';
export { Button } from './components/Button';
export type { ButtonProps, ButtonVariant } from './components/Button';
export { Glow } from './components/Glow';
export type { GlowProps } from './components/Glow';
export { Press } from './components/Press';
export type { PressProps } from './components/Press';
export { Pulse } from './components/Pulse';
export type { PulseProps } from './components/Pulse';
export { Screen } from './components/Screen';
export type { ScreenProps } from './components/Screen';
export { Skeleton } from './components/Skeleton';
export type { SkeletonProps } from './components/Skeleton';
export { Text } from './components/Text';
export type { Ink, TextProps } from './components/Text';
export { DesignProvider, useDesign, useMotion, useTheme } from './DesignProvider';
export type { Appearance, Design, MotionPreference } from './DesignProvider';
export { haptic, HAPTICS } from './haptics';
export type { HapticRole } from './haptics';
export { GLOW_RADIUS, GUTTER, HERO, RADIUS, RING_WIDTH, SPACE, TARGET } from './layout';
export {
  BREATH,
  CSS_CURVE,
  CSS_SPRING,
  CURVES,
  DURATION,
  EASE,
  ENTER,
  PRESS,
  SPRING_CURVE,
  STAGGER,
  TEXT_BLEND,
  TONE_BLEND,
  VIEW_BLEND,
  WAIT,
} from './motion';
export { DISABLED_OPACITY, PALETTE, SCHEMES } from './palette';
export type { Neutrals, Scheme } from './palette';
export { buildTheme, navigationTheme } from './theme';
export type { Colors, Theme } from './theme';
export { deriveTone } from './tone';
export type { ToneColors } from './tone';
export { FONT_FILES, FONTS, MARK_EXTENT, TYPE } from './typography';
export type { TypeVariant } from './typography';

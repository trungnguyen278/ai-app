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
export { Screen } from './components/Screen';
export type { ScreenProps } from './components/Screen';
export { Text } from './components/Text';
export type { Ink, TextProps } from './components/Text';
export { DesignProvider, useDesign, useTheme } from './DesignProvider';
export type { Appearance, Design } from './DesignProvider';
export { GLOW_RADIUS, GUTTER, RADIUS, RING_WIDTH, SPACE, TARGET } from './layout';
export { CURVES, TEXT_BLEND, TONE_BLEND, VIEW_BLEND } from './motion';
export { PALETTE, SCHEMES } from './palette';
export type { Neutrals, Scheme } from './palette';
export { buildTheme, navigationTheme } from './theme';
export type { Colors, Theme } from './theme';
export { deriveTone } from './tone';
export type { ToneColors } from './tone';
export { FONT_FILES, FONTS, MARK_EXTENT, TYPE } from './typography';
export type { TypeVariant } from './typography';

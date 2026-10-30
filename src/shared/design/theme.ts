// SPDX-License-Identifier: MIT
// A theme: the neutrals of a scheme, and the colours of the current tone in it.
import type { Theme as NavigationTheme } from 'expo-router';

import { PALETTE, type Neutrals, type Scheme } from './palette';
import { deriveTone, type ToneColors } from './tone';
import { FONTS } from './typography';

export type Colors = Neutrals & ToneColors;

export interface Theme {
  scheme: Scheme;
  color: Colors;
  /** How strongly light glows, from 0 to 1. */
  glowOpacity: number;
}

/** The theme of `scheme`, with `tone`'s colours. */
export function buildTheme(scheme: Scheme, tone: string): Theme {
  const { tint: _tint, glowOpacity, ...neutrals } = PALETTE[scheme];
  return { scheme, color: { ...neutrals, ...deriveTone(tone, scheme) }, glowOpacity };
}

/** The same theme, for the navigation's own views: headers, and the ground behind screens. */
export function navigationTheme({ scheme, color }: Theme): NavigationTheme {
  return {
    dark: scheme === 'dark',
    colors: {
      primary: color.accent,
      background: color.canvas,
      card: color.canvas,
      text: color.text,
      border: color.hairline,
      notification: color.accent,
    },
    // Each weight is a family of its own (typography.ts).
    fonts: {
      regular: { fontFamily: FONTS.regular, fontWeight: 'normal' },
      medium: { fontFamily: FONTS.medium, fontWeight: 'normal' },
      bold: { fontFamily: FONTS.semibold, fontWeight: 'normal' },
      heavy: { fontFamily: FONTS.bold, fontWeight: 'normal' },
    },
  };
}

// SPDX-License-Identifier: MIT
// A theme: the neutrals of a scheme, the colours of the current tone in it, and danger's.
import type { Theme as NavigationTheme } from 'expo-router';

import { PALETTE, type Neutrals, type Scheme } from './palette';
import { deriveTone, type ToneColors } from './tone';
import { FONTS } from './typography';

/** Danger's colours in one theme: what went wrong, or cannot be undone, whatever the tone. */
export interface DangerColors {
  /** Text, icons, lines and fills of danger: TEXT_CONTRAST with every background. */
  danger: string;
  /** What is written on a danger fill. */
  onDanger: string;
  /** A surface tinted with danger, behind danger text. */
  dangerSoft: string;
}

/** Danger's colours in `scheme`, worked out from palette.json's red as a tone's are. */
export function dangerColors(scheme: Scheme): DangerColors {
  const { accent, onAccent, accentSoft } = deriveTone(PALETTE.danger, scheme);
  return { danger: accent, onDanger: onAccent, dangerSoft: accentSoft };
}

// Worked out once: danger does not change with the tone.
const DANGER: Readonly<Record<Scheme, DangerColors>> = {
  light: dangerColors('light'),
  dark: dangerColors('dark'),
};

export type Colors = Neutrals & ToneColors & DangerColors;

export interface Theme {
  scheme: Scheme;
  color: Colors;
  /** How strongly light glows, from 0 to 1. */
  glowOpacity: number;
}

/** The theme of `scheme`, with `tone`'s colours. */
export function buildTheme(scheme: Scheme, tone: string): Theme {
  const { tint: _tint, glowOpacity, ...neutrals } = PALETTE[scheme];
  const color = { ...neutrals, ...deriveTone(tone, scheme), ...DANGER[scheme] };
  return { scheme, color, glowOpacity };
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

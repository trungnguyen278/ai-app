// SPDX-License-Identifier: MIT
// The design system's colours (ADR-0003, docs/design.md). They live in palette.json, which the
// app's native configuration reads too, for the splash screen.
import data from './palette.json';

export type Scheme = 'light' | 'dark';

export const SCHEMES: readonly Scheme[] = ['light', 'dark'];

/** The colours of a theme that do not change with the tone. */
export interface Neutrals {
  /** The ground of every screen. In the dark theme it is the robot's own. */
  canvas: string;
  /** What rises from the canvas: cards, sheets, grouped rows. */
  surface: string;
  /** Controls drawn on a surface, a pressed or selected row. */
  fill: string;
  /** Lines that only separate. */
  hairline: string;
  /** Lines that show where a control is: COMPONENT_CONTRAST with every background. */
  outline: string;
  /** Text: TEXT_CONTRAST with every background, and far beyond. */
  text: string;
  /** Text that comes second: TEXT_CONTRAST with every background. */
  textMuted: string;
}

/** A theme in palette.json. */
export interface ThemeData extends Neutrals {
  /** How the tone tints a surface, in OKLCH: the tint's lightness, and the most chroma it keeps. */
  tint: { lightness: number; chroma: number };
  /** How strongly light glows, from 0 to 1. */
  glowOpacity: number;
}

export interface PaletteData {
  /**
   * The tone while the robot's is not known: its calm cyan, from ai-robot's ui/src/tones.js.
   */
  tone: string;
  light: ThemeData;
  dark: ThemeData;
}

export const PALETTE: PaletteData = data;

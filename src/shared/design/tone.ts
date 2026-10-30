// SPDX-License-Identifier: MIT
// The tone: the robot's colour of the moment, as the app shows it in each theme (ADR-0003).
import { contrast, fromLch, isHex, reachContrast, TEXT_CONTRAST, toLch } from './color';
import { PALETTE, type Scheme } from './palette';

/** A tone's colours in one theme. */
export interface ToneColors {
  /** Text, icons, fills and focus in the tone: TEXT_CONTRAST with every background. */
  accent: string;
  /** What is written on an accent fill. */
  onAccent: string;
  /** A surface tinted with the tone, behind accent text. */
  accentSoft: string;
  /** The tone as the robot shows it: for light that glows, never for text. */
  glow: string;
}

/**
 * `tone`'s colours in `scheme`. The robot's tones are bright, and keep their own colour on the
 * dark canvas; on the light one they darken until they can be read.
 */
export function deriveTone(tone: string, scheme: Scheme): ToneColors {
  if (!isHex(tone)) {
    throw new Error('a tone is a colour written #rrggbb');
  }
  const glow = tone.toLowerCase();
  const { canvas, surface, fill, tint } = PALETTE[scheme];
  const { c, h } = toLch(glow);
  const accentSoft = fromLch({ l: tint.lightness, c: Math.min(c, tint.chroma), h });
  const accent = reachContrast(
    glow,
    [canvas, surface, fill, accentSoft],
    TEXT_CONTRAST,
    scheme === 'dark' ? 'lighter' : 'darker',
  );
  // The accent reaches TEXT_CONTRAST with both, so the better one does too.
  const onAccent = contrast(canvas, accent) >= contrast(surface, accent) ? canvas : surface;
  return { accent, onAccent, accentSoft, glow };
}

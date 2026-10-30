// SPDX-License-Identifier: MIT
// Colour arithmetic for the design system, on culori: WCAG 2.2's contrast, and OKLCH, a
// perceptual space where a colour can be made lighter or darker and keep its hue.
import {
  clampChroma,
  formatHex,
  modeLrgb,
  modeOklch,
  modeRgb,
  useMode as registerMode,
  wcagContrast,
} from 'culori/fn';

// culori's light entry point knows only the colour spaces registered with it.
registerMode(modeRgb);
registerMode(modeLrgb);
const oklch = registerMode(modeOklch);

/** WCAG 2.2's least contrast for text, 1.4.3 (AA). */
export const TEXT_CONTRAST = 4.5;
/** WCAG 2.2's least contrast for what identifies a component or its state, 1.4.11. */
export const COMPONENT_CONTRAST = 3;

// Halvings of the lightness range: far finer than a step of #rrggbb.
const SEARCH_STEPS = 16;

/** A colour in OKLCH: lightness from 0 to 1, chroma, and hue in degrees. */
export interface Lch {
  l: number;
  c: number;
  h: number;
}

/** Whether `value` is a colour as the design data writes it: #rrggbb. */
export function isHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

/** `colour` with an opacity from 0 to 1, as #rrggbbaa. */
export function withOpacity(colour: string, opacity: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
  return `${colour.slice(0, 7)}${alpha.toString(16).padStart(2, '0')}`;
}

/** WCAG 2.2's contrast ratio of two colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  return wcagContrast(a, b);
}

/** The lowest contrast of `colour` with any of `backgrounds`. */
export function leastContrast(colour: string, backgrounds: readonly string[]): number {
  return Math.min(...backgrounds.map((background) => contrast(colour, background)));
}

/** `colour` in OKLCH. A grey has no hue, and gets 0. */
export function toLch(colour: string): Lch {
  const lch = oklch(colour);
  if (lch === undefined) {
    throw new Error('not a colour');
  }
  return { l: lch.l, c: lch.c, h: lch.h ?? 0 };
}

/** The sRGB colour of `lch`, as #rrggbb, with as much of its chroma as sRGB can show. */
export function fromLch({ l, c, h }: Lch): string {
  return formatHex(clampChroma({ mode: 'oklch', l, c, h }, 'oklch'));
}

/**
 * `colour`, made lighter or darker only as far as it takes to reach `ratio` with every one of
 * `backgrounds`. Its hue stays, and its chroma as far as sRGB allows.
 */
export function reachContrast(
  colour: string,
  backgrounds: readonly string[],
  ratio: number,
  direction: 'lighter' | 'darker',
): string {
  if (leastContrast(colour, backgrounds) >= ratio) {
    return colour;
  }
  const { l, c, h } = toLch(colour);
  const at = (lightness: number) => fromLch({ l: lightness, c, h });
  // Between `short`, which falls short, and `enough`, which reaches the ratio: white or black
  // reach it if any colour does.
  let short = l;
  let enough = direction === 'lighter' ? 1 : 0;
  if (leastContrast(at(enough), backgrounds) < ratio) {
    throw new Error(`no colour reaches ${ratio}:1 with these backgrounds`);
  }
  for (let step = 0; step < SEARCH_STEPS; step++) {
    const middle = (short + enough) / 2;
    if (leastContrast(at(middle), backgrounds) >= ratio) {
      enough = middle;
    } else {
      short = middle;
    }
  }
  return at(enough);
}

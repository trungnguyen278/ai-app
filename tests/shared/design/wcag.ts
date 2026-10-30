// SPDX-License-Identifier: MIT
// WCAG 2.2's contrast ratio, written here again from its definitions ("relative luminance",
// "contrast ratio"), so that the tests do not check the design system with its own arithmetic,
// nor with its own thresholds.

/** Text, 1.4.3 (AA). */
export const TEXT = 4.5;
/** What identifies a component or its state, 1.4.11. */
export const COMPONENT = 3;
/** Text, enhanced, 1.4.6 (AAA): the bar for the main text. */
export const ENHANCED = 7;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two colours written #rrggbb. */
export function ratio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

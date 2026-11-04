// SPDX-License-Identifier: MIT
// palette.json: both themes complete, and their neutrals readable.
import {
  buildTheme,
  dangerColors,
  isHex,
  PALETTE,
  SCHEMES,
  type Neutrals,
} from '@/src/shared/design';

import { COMPONENT, ENHANCED, luminance, ratio, TEXT } from './wcag';

const NEUTRALS: (keyof Neutrals)[] = [
  'canvas',
  'surface',
  'fill',
  'hairline',
  'outline',
  'text',
  'textMuted',
  'shimmer',
];

test('both themes have the same colours, and nothing else', () => {
  expect(Object.keys(PALETTE).sort()).toEqual(['code', 'danger', 'dark', 'light', 'tone']);
  for (const scheme of SCHEMES) {
    expect(Object.keys(PALETTE[scheme]).sort()).toEqual(
      [...NEUTRALS, 'tint', 'glowOpacity'].sort(),
    );
  }
});

test('every colour is written #rrggbb', () => {
  expect(isHex(PALETTE.tone)).toBe(true);
  expect(isHex(PALETTE.danger)).toBe(true);
  expect(isHex(PALETTE.code.ink) && isHex(PALETTE.code.paper)).toBe(true);
  for (const scheme of SCHEMES) {
    for (const name of NEUTRALS) {
      expect(isHex(PALETTE[scheme][name])).toBe(true);
    }
  }
});

test("the dark canvas is the robot's own, and the tone its calm cyan", () => {
  // ai-robot's ui/src/tones.js: BACKGROUND, and TONES.cyan.
  expect(PALETTE.dark.canvas).toBe('#06090d');
  expect(PALETTE.tone).toBe('#5be9ff');
});

test('a QR code is dark on light in both themes, and as clear as the main text', () => {
  expect(luminance(PALETTE.code.ink)).toBeLessThan(luminance(PALETTE.code.paper));
  expect(ratio(PALETTE.code.ink, PALETTE.code.paper)).toBeGreaterThanOrEqual(ENHANCED);
});

describe.each(SCHEMES)('in the %s theme', (scheme) => {
  const theme = PALETTE[scheme];
  const backgrounds = [theme.canvas, theme.surface, theme.fill];

  test.each([
    ['text', ENHANCED],
    ['textMuted', TEXT],
    ['outline', COMPONENT],
  ] as const)('%s stands out from every background', (name, least) => {
    for (const background of backgrounds) {
      expect(ratio(theme[name], background)).toBeGreaterThanOrEqual(least);
    }
  });

  test('the shimmer is lighter than the fill it crosses', () => {
    expect(ratio(theme.shimmer, '#000000')).toBeGreaterThan(ratio(theme.fill, '#000000'));
  });

  test('the tint and the glow are in range', () => {
    expect(theme.tint.lightness).toBeGreaterThan(0);
    expect(theme.tint.lightness).toBeLessThan(1);
    expect(theme.tint.chroma).toBeGreaterThanOrEqual(0);
    expect(theme.glowOpacity).toBeGreaterThan(0);
    expect(theme.glowOpacity).toBeLessThanOrEqual(1);
  });

  test("danger can be read on every background, its tint's too, and onDanger on it", () => {
    const { danger, onDanger, dangerSoft } = dangerColors(scheme);
    for (const background of [...backgrounds, dangerSoft]) {
      expect(ratio(danger, background)).toBeGreaterThanOrEqual(TEXT);
    }
    expect(ratio(onDanger, danger)).toBeGreaterThanOrEqual(TEXT);
  });

  test('danger does not follow the tone', () => {
    const { danger } = dangerColors(scheme);
    for (const tone of ['#5be9ff', '#ff4d6d', '#7cff6b']) {
      expect(buildTheme(scheme, tone).color.danger).toBe(danger);
    }
  });
});

// SPDX-License-Identifier: MIT
// The tone's colours reach WCAG 2.2 AA in both themes, for the robot's tones and for any other.
import { clampChroma, formatHex, modeOklch, modeRgb, useMode as registerMode } from 'culori/fn';

import { deriveTone, PALETTE, SCHEMES, type Scheme } from '@/src/shared/design';
import { ROBOT_TONES } from '@/src/studio';

import { ratio, TEXT } from './wcag';

registerMode(modeRgb);
const oklch = registerMode(modeOklch);

const ROBOT = Object.entries(ROBOT_TONES);

// Colours all round the hue circle, from grey to as vivid as sRGB allows, dark to light.
const SWEEP = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].flatMap((h) =>
  [0, 0.06, 0.15, 0.3].flatMap((c) =>
    [0.15, 0.4, 0.7, 0.95].map((l) => formatHex(clampChroma({ mode: 'oklch', l, c, h }, 'oklch'))),
  ),
);

function expectReadable(tone: string, scheme: Scheme) {
  const { canvas, surface, fill } = PALETTE[scheme];
  const { accent, onAccent, accentSoft } = deriveTone(tone, scheme);
  for (const background of [canvas, surface, fill, accentSoft]) {
    expect(ratio(accent, background)).toBeGreaterThanOrEqual(TEXT);
  }
  expect(ratio(onAccent, accent)).toBeGreaterThanOrEqual(TEXT);
}

describe.each(SCHEMES)('in the %s theme', (scheme) => {
  test.each(ROBOT)("the robot's %s can be read", (_, tone) => expectReadable(tone, scheme));

  test('any colour can be read', () => {
    for (const tone of SWEEP) {
      expectReadable(tone, scheme);
    }
  });

  test('the ink on an accent fill is the background that stands out most from it', () => {
    const { canvas, surface } = PALETTE[scheme];
    for (const tone of [...Object.values(ROBOT_TONES), ...SWEEP]) {
      const { accent, onAccent } = deriveTone(tone, scheme);
      const best = Math.max(ratio(canvas, accent), ratio(surface, accent));
      expect(ratio(onAccent, accent)).toBe(best);
    }
  });

  test.each(ROBOT)("%s glows in the robot's own colour", (_, tone) => {
    expect(deriveTone(tone.toUpperCase(), scheme).glow).toBe(tone);
  });
});

test.each(ROBOT)("on the dark canvas, the robot's %s keeps its own colour", (_, tone) => {
  expect(deriveTone(tone, 'dark').accent).toBe(tone);
});

test.each(ROBOT.filter(([name]) => name !== 'white'))(
  'on the light canvas, %s darkens and keeps its hue',
  (_, tone) => {
    const accent = oklch(deriveTone(tone, 'light').accent)!;
    const own = oklch(tone)!;
    expect(accent.l).toBeLessThan(own.l);
    const turn = Math.abs(accent.h! - own.h!) % 360;
    expect(Math.min(turn, 360 - turn)).toBeLessThan(5);
  },
);

test('a tone darkens only as far as it must', () => {
  const { canvas, surface, fill } = PALETTE.light;
  const { accent, accentSoft } = deriveTone(ROBOT_TONES.cyan, 'light');
  const { l, c, h } = oklch(accent)!;
  // A shade a little lighter falls short with one of the backgrounds.
  const lighter = formatHex(clampChroma({ mode: 'oklch', l: l + 0.01, c, h }, 'oklch'));
  const least = Math.min(...[canvas, surface, fill, accentSoft].map((b) => ratio(lighter, b)));
  expect(least).toBeLessThan(TEXT);
});

test('a tone is a colour written #rrggbb', () => {
  for (const tone of ['cyan', '#5be9f', '#5be9ffaa', 'rgb(91, 233, 255)']) {
    expect(() => deriveTone(tone, 'dark')).toThrow('a tone is a colour written #rrggbb');
  }
});

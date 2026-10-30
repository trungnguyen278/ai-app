// SPDX-License-Identifier: MIT
import { FONT_FILES, MARK_EXTENT, TYPE } from '@/src/shared/design';

const VARIANTS = Object.entries(TYPE);

test.each(VARIANTS)('%s is set in a font the app loads, its weight with it', (_, style) => {
  expect(Object.keys(FONT_FILES)).toContain(style.fontFamily);
  expect(style).not.toHaveProperty('fontWeight');
});

test.each(VARIANTS)("%s's lines clip no Vietnamese mark", (_, style) => {
  expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize * MARK_EXTENT);
});

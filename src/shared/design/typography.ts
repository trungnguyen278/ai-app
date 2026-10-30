// SPDX-License-Identifier: MIT
// Type: Be Vietnam Pro, drawn for Vietnamese (ADR-0003), on one scale.
import { BeVietnamPro_400Regular } from '@expo-google-fonts/be-vietnam-pro/400Regular';
import { BeVietnamPro_500Medium } from '@expo-google-fonts/be-vietnam-pro/500Medium';
import { BeVietnamPro_600SemiBold } from '@expo-google-fonts/be-vietnam-pro/600SemiBold';
import { BeVietnamPro_700Bold } from '@expo-google-fonts/be-vietnam-pro/700Bold';
import type { TextStyle } from 'react-native';

/** The weights the app uses, each a family of its own once loaded. Only these files ship. */
export const FONTS = {
  regular: 'BeVietnamPro_400Regular',
  medium: 'BeVietnamPro_500Medium',
  semibold: 'BeVietnamPro_600SemiBold',
  bold: 'BeVietnamPro_700Bold',
} as const;

/** The files behind FONTS, for expo-font's useFonts. */
export const FONT_FILES: Record<string, number> = {
  [FONTS.regular]: BeVietnamPro_400Regular,
  [FONTS.medium]: BeVietnamPro_500Medium,
  [FONTS.semibold]: BeVietnamPro_600SemiBold,
  [FONTS.bold]: BeVietnamPro_700Bold,
};

/**
 * How tall Vietnamese text reaches, in ems: from the font's descender (0.265) to the top of a
 * capital with two marks, such as Ẫ (1.149 in the bold, measured from Be Vietnam Pro 0.4.1's
 * glyphs). A line at least this tall clips no mark.
 */
export const MARK_EXTENT = 1.414;

/** The type scale. Weight comes with the family, so no style sets fontWeight. */
export const TYPE = {
  display: { fontFamily: FONTS.bold, fontSize: 32, lineHeight: 46, letterSpacing: -0.3 },
  title: { fontFamily: FONTS.bold, fontSize: 26, lineHeight: 37, letterSpacing: -0.2 },
  heading: { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 29 },
  body: { fontFamily: FONTS.regular, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 24 },
  label: { fontFamily: FONTS.medium, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 19 },
} as const satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof TYPE;

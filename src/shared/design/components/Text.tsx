// SPDX-License-Identifier: MIT
import { Text as NativeText, type TextProps as NativeTextProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { useTheme } from '../DesignProvider';
import { TEXT_BLEND } from '../motion';
import { TYPE, type TypeVariant } from '../typography';

/** The colours text may take. */
export type Ink = 'text' | 'textMuted' | 'accent' | 'onAccent';

export interface TextProps extends NativeTextProps {
  variant?: TypeVariant;
  ink?: Ink;
}

// Inks of the tone blend with it, on the UI thread. The others change only with the theme.
const TONED: ReadonlySet<Ink> = new Set(['accent', 'onAccent']);
const HEADINGS: ReadonlySet<TypeVariant> = new Set(['display', 'title', 'heading']);

/** Text on the type scale, in one of the theme's inks. Headings are announced as headings. */
export function Text({ variant = 'body', ink = 'text', style, ...props }: TextProps) {
  const { color } = useTheme();
  const role = HEADINGS.has(variant) ? 'header' : undefined;
  const look = [TYPE[variant], { color: color[ink] }];
  if (TONED.has(ink)) {
    return (
      <Animated.Text accessibilityRole={role} style={[...look, TEXT_BLEND, style]} {...props} />
    );
  }
  return <NativeText accessibilityRole={role} style={[...look, style]} {...props} />;
}

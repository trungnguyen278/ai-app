// SPDX-License-Identifier: MIT
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { withOpacity } from '../color';
import { useTheme } from '../DesignProvider';
import type { HapticRole } from '../haptics';
import { GLOW_RADIUS, RADIUS, SPACE, TARGET } from '../layout';
import { DISABLED_OPACITY } from '../palette';
import type { Theme } from '../theme';
import { Press } from './Press';
import { Pulse } from './Pulse';
import { Text } from './Text';

/**
 * What a button weighs:
 * - `primary`: the one thing a screen is for, filled with the tone, and glowing;
 * - `secondary`: another thing it offers, on a tint of the tone;
 * - `plain`: a lesser one, the tone's text alone.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'plain';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  /** It cannot be used now. */
  disabled?: boolean;
  /** What it started is under way: the tone pulses where the label was. */
  busy?: boolean;
  haptic?: HapticRole;
  /** Where it sits: its margins, its width. Its look is the variant's. */
  style?: StyleProp<ViewStyle>;
}

function look(variant: ButtonVariant, { color, glowOpacity }: Theme) {
  switch (variant) {
    case 'primary':
      return {
        ink: 'onAccent' as const,
        fill: {
          backgroundColor: color.accent,
          boxShadow: [
            {
              offsetX: 0,
              offsetY: 0,
              blurRadius: GLOW_RADIUS.md,
              color: withOpacity(color.glow, glowOpacity),
            },
          ],
        },
      };
    case 'secondary':
      return { ink: 'accent' as const, fill: { backgroundColor: color.accentSoft } };
    case 'plain':
      return { ink: 'accent' as const, fill: { backgroundColor: 'transparent' } };
  }
}

/** A button: a press commits what its label says. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  haptic,
  style,
}: ButtonProps) {
  const theme = useTheme();
  const { ink, fill } = look(variant, theme);
  const inactive = disabled || busy;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      haptic={haptic}
      onPress={onPress}
      style={[styles.button, fill, disabled && styles.disabled, style]}
    >
      {busy ? (
        <Pulse ink={ink} />
      ) : (
        <Text variant="label" ink={ink}>
          {label}
        </Text>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TARGET,
    paddingHorizontal: SPACE.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
  },
  disabled: { opacity: DISABLED_OPACITY },
});

// SPDX-License-Identifier: MIT
import { useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { useMotion, useTheme } from '../DesignProvider';
import { haptic as play, type HapticRole } from '../haptics';
import { CSS_SPRING, DURATION, PRESS, TONE_BLEND } from '../motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressProps extends Omit<PressableProps, 'style' | 'children'> {
  /**
   * How a press shows, from the touch: what has the size of a button or a card shrinks a little;
   * a row as wide as the screen lights up instead, since a row that shrinks squeezes the page.
   */
  feedback?: 'shrink' | 'light';
  /** The haptic for what the press does, played as it does it. */
  haptic?: HapticRole;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * What a finger presses. The press shows within a frame, on the UI thread, and lets go the
 * same way; with reduce motion on, a shrink becomes a dim. Colours that follow the tone blend
 * with it.
 */
export function Press({
  feedback = 'shrink',
  haptic,
  style,
  children,
  onPress,
  onPressIn,
  onPressOut,
  ...props
}: PressProps) {
  const { color } = useTheme();
  const { reduced } = useMotion();
  const [pressed, setPressed] = useState(false);
  const shows = feedback === 'light' ? 'backgroundColor' : reduced ? 'opacity' : 'transform';
  // At rest, the caller's style wins, such as a disabled button's opacity; pressed, the press does.
  const resting =
    shows === 'backgroundColor'
      ? { backgroundColor: 'transparent' }
      : shows === 'opacity'
        ? { opacity: 1 }
        : { transform: [{ scale: 1 }] };
  const held =
    shows === 'backgroundColor'
      ? { backgroundColor: color.fill }
      : shows === 'opacity'
        ? { opacity: PRESS.opacity }
        : { transform: [{ scale: PRESS.scale }] };
  // The press answers with a spring (ADR-0003); colours that follow the tone blend at its pace.
  const toned = shows === 'backgroundColor' ? [] : (['backgroundColor', 'borderColor'] as const);
  const transition = {
    transitionProperty: [shows, ...toned],
    transitionDuration: [DURATION.press, ...toned.map(() => TONE_BLEND.duration)],
    transitionTimingFunction: [CSS_SPRING, ...toned.map(() => TONE_BLEND.easing)],
  };
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      onPress={(event) => {
        if (haptic !== undefined) {
          play(haptic);
        }
        onPress?.(event);
      }}
      style={[resting, style, pressed && held, transition]}
    >
      {children}
    </AnimatedPressable>
  );
}

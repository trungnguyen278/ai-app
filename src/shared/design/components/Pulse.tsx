// SPDX-License-Identifier: MIT
import { StyleSheet, View } from 'react-native';
import Animated, { css } from 'react-native-reanimated';

import { useMotion, useTheme } from '../DesignProvider';
import { RADIUS, SPACE } from '../layout';
import { CSS_CURVE, VIEW_BLEND, WAIT } from '../motion';
import type { Ink } from './Text';

const DOTS = 3;

// A dot's beat: from faint and small to full, and back. Its first frame is its resting style.
const RESTING = { opacity: 0.3, transform: [{ scale: 0.8 }] };
const BEAT = css.keyframes({
  '50%': { opacity: 1, transform: [{ scale: 1 }] },
});

export interface PulseProps {
  /** The colour of the dots: the accent, or the ink on an accent fill. */
  ink?: Extract<Ink, 'accent' | 'onAccent'>;
  /** What is under way, for screen readers, when nothing around the dots says it. */
  label?: string;
}

/**
 * Waiting, in the tone: three dots that pulse one after another, as the robot thinks. With
 * reduce motion on, they hold still.
 */
export function Pulse({ ink = 'accent', label }: PulseProps) {
  const { color } = useTheme();
  const { reduced } = useMotion();
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={styles.row}
    >
      {Array.from({ length: DOTS }, (_, index) => (
        <Animated.View
          key={index}
          style={[
            styles.dot,
            { backgroundColor: color[ink] },
            VIEW_BLEND,
            !reduced && {
              ...RESTING,
              animationName: BEAT,
              animationDuration: WAIT.pulse,
              animationDelay: index * WAIT.ripple,
              animationIterationCount: 'infinite',
              animationTimingFunction: CSS_CURVE.inOut,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  dot: { width: SPACE.sm, height: SPACE.sm, borderRadius: RADIUS.full },
});

// SPDX-License-Identifier: MIT
import {
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { css } from 'react-native-reanimated';

import { withOpacity } from '../color';
import { useMotion, useTheme } from '../DesignProvider';
import { RADIUS } from '../layout';
import { WAIT } from '../motion';

// The light crosses the shape from its left edge to its right, again and again.
const SWEEP = css.keyframes({
  from: { transform: [{ translateX: '-100%' }] },
  to: { transform: [{ translateX: '100%' }] },
});

export interface SkeletonProps {
  width: DimensionValue;
  height: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * The shape of content still loading, with a light crossing it. With reduce motion on, the
 * shape stays and the light does not cross. Screen readers skip it: what holds it says it is
 * loading.
 */
export function Skeleton({ width, height, radius = RADIUS.sm, style }: SkeletonProps) {
  const { color } = useTheme();
  const { reduced } = useMotion();
  const clear = withOpacity(color.shimmer, 0);
  return (
    <View
      aria-hidden
      style={[
        styles.shape,
        { width, height, borderRadius: radius, backgroundColor: color.fill },
        style,
      ]}
    >
      {!reduced && (
        <Animated.View
          testID="shimmer"
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundImage: `linear-gradient(90deg, ${clear}, ${color.shimmer}, ${clear})`,
              transform: [{ translateX: '-100%' }],
              animationName: SWEEP,
              animationDuration: WAIT.shimmer,
              animationIterationCount: 'infinite',
              // Constant motion keeps a constant speed.
              animationTimingFunction: 'linear',
            },
          ]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  shape: { overflow: 'hidden' },
});

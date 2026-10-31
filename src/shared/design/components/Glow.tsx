// SPDX-License-Identifier: MIT
import { BlurMask, Canvas, Circle, Group, interpolateColors } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import {
  cancelAnimation,
  Easing,
  interpolate,
  ReduceMotion,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion, useTheme } from '../DesignProvider';
import { BREATH, EASE, TONE_BLEND } from '../motion';

/**
 * The halo's shape, as parts of the canvas's size: its radius, and its blur's sigma. A blur
 * fades out within three sigmas, so even at the top of a breath the halo stays on the canvas.
 */
const HALO = { radius: 0.22, sigma: 1 / 12 };

// The breath's ranges, as the worklets below read them.
const SCALE = [...BREATH.scale];
const OPACITY = [...BREATH.opacity];

export interface GlowProps {
  /** The canvas's width and height: the light fades out inside it. */
  size: number;
  /** Whether it breathes, for the rare moments that call for it. */
  breathing?: boolean;
  style?: StyleProp<ViewStyle>;
  /** How tests, and end-to-end tests, find it. */
  testID?: string;
}

/**
 * Light in the tone, as the robot's face gives it off: a soft halo, drawn with Skia. When the
 * tone changes, it blends to the new one with the rest of the app; when it breathes, it does so
 * with the robot's breath. With reduce motion on, it holds still.
 */
export function Glow({ size, breathing = false, style, testID }: GlowProps) {
  const { color, glowOpacity } = useTheme();
  const { reduced } = useMotion();

  // The colour blends from the last tone to the new one, on the UI thread.
  const from = useSharedValue(color.glow);
  const to = useSharedValue(color.glow);
  const blend = useSharedValue(1);
  useEffect(() => {
    if (to.get() === color.glow) {
      return;
    }
    from.set(to.get());
    to.set(color.glow);
    blend.set(0);
    blend.set(
      withTiming(1, {
        duration: TONE_BLEND.duration,
        easing: EASE.inOut,
        reduceMotion: ReduceMotion.Never,
      }),
    );
  }, [color.glow, from, to, blend]);
  const paint = useDerivedValue(() =>
    interpolateColors(blend.get(), [0, 1], [from.get(), to.get()]),
  );

  // The breath, from 0 at its bottom to 1 at its top; still, the light rests at its top.
  const breath = useSharedValue(1);
  const breathes = breathing && !reduced;
  useEffect(() => {
    if (!breathes) {
      cancelAnimation(breath);
      breath.set(1);
      return;
    }
    breath.set(0);
    breath.set(
      withRepeat(
        withTiming(1, {
          duration: BREATH.period / 2,
          easing: Easing.inOut(Easing.sin),
          reduceMotion: ReduceMotion.Never,
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(breath);
  }, [breathes, breath]);
  const radius = useDerivedValue(
    () => size * HALO.radius * interpolate(breath.get(), [0, 1], SCALE),
  );
  const opacity = useDerivedValue(() => glowOpacity * interpolate(breath.get(), [0, 1], OPACITY));

  return (
    <Canvas
      testID={testID}
      aria-hidden
      pointerEvents="none"
      // Skia's canvas takes one flat style: on the web, it hands it to the page as it is.
      style={StyleSheet.flatten([{ width: size, height: size }, style])}
    >
      <Group opacity={opacity}>
        <Circle cx={size / 2} cy={size / 2} r={radius} color={paint}>
          <BlurMask blur={size * HALO.sigma} style="normal" />
        </Circle>
      </Group>
    </Canvas>
  );
}

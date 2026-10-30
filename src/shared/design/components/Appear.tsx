// SPDX-License-Identifier: MIT
import { useMemo, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  FadingTransition,
  Keyframe,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';

import { useMotion } from '../DesignProvider';
import { DURATION, EASE, ENTER, STAGGER } from '../motion';

/** A motion from one state to another, in a given time: the data a keyframe is built from. */
export interface Frames {
  from: { opacity: number; transform?: [{ translateY: number }, { scale: number }] };
  to: { opacity: number; transform?: [{ translateY: number }, { scale: number }] };
  duration: number;
}

/** How something enters: it rises into place and grows to its size; with reduce motion, it fades in. */
export function enterFrames(reduced: boolean): Frames {
  return reduced
    ? { from: { opacity: 0 }, to: { opacity: 1 }, duration: DURATION.fade }
    : {
        from: { opacity: 0, transform: [{ translateY: ENTER.rise }, { scale: ENTER.scale }] },
        to: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
        duration: DURATION.enter,
      };
}

/** How something leaves: the way it came, half as far and faster; with reduce motion, it fades out. */
export function exitFrames(reduced: boolean): Frames {
  return reduced
    ? { from: { opacity: 1 }, to: { opacity: 0 }, duration: DURATION.fade }
    : {
        from: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
        to: { opacity: 0, transform: [{ translateY: ENTER.rise / 2 }, { scale: ENTER.scale }] },
        duration: DURATION.exit,
      };
}

// Reduce motion is already in the frames, so Reanimated plays them as they are.
function keyframe({ from, to, duration }: Frames) {
  return new Keyframe({ 0: from, 100: { ...to, easing: EASE.out } })
    .duration(duration)
    .reduceMotion(ReduceMotion.Never);
}

// When something enters or leaves, its neighbours move aside; with reduce motion, they fade over.
const REFLOW = LinearTransition.duration(DURATION.change)
  .easing(EASE.inOut)
  .reduceMotion(ReduceMotion.Never);
const REFLOW_REDUCED = FadingTransition.duration(DURATION.fade).reduceMotion(ReduceMotion.Never);

export interface AppearProps {
  children: ReactNode;
  /** Its place among things entering together: each enters a little after the one before. */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Something that enters and leaves, never jumps, and makes room as its neighbours come and go.
 * For what arrives once, such as what a person waited for; a list scrolled every day is
 * already there.
 */
export function Appear({ children, index = 0, style }: AppearProps) {
  const { reduced } = useMotion();
  const entering = useMemo(
    () => keyframe(enterFrames(reduced)).delay(index * STAGGER),
    [reduced, index],
  );
  const exiting = useMemo(() => keyframe(exitFrames(reduced)), [reduced]);
  return (
    <Animated.View
      entering={entering}
      exiting={exiting}
      layout={reduced ? REFLOW_REDUCED : REFLOW}
      style={style}
    >
      {children}
    </Animated.View>
  );
}

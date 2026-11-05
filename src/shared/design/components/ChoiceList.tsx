// SPDX-License-Identifier: MIT
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { type CSSTransitionProperties } from 'react-native-reanimated';

import { useMotion, useTheme } from '../DesignProvider';
import { MARK, RADIUS, RING_WIDTH, SPACE, TARGET } from '../layout';
import { strokesThrough } from '../marks';
import { CSS_CURVE, CSS_SPRING, DURATION, TONE_BLEND, VIEW_BLEND } from '../motion';
import { DISABLED_OPACITY } from '../palette';
import { Press } from './Press';
import { Pulse } from './Pulse';
import { Text } from './Text';

/** One of the options of a choice. */
export interface ChoiceOption<T extends string> {
  value: T;
  /** What the option is called: screen readers say it, and people say it to choose it. */
  label: string;
  /** What choosing it means, on a line under the label, such as what a role allows. */
  detail?: string;
}

export interface ChoiceListProps<T extends string> {
  /** What is chosen, always shown above the options. */
  label: string;
  options: readonly ChoiceOption<T>[];
  /** The option chosen. */
  value: T;
  /** Called with another option when it is chosen; never with the one chosen already. */
  onChange: (value: T) => void;
  /** Nothing can be chosen now. */
  disabled?: boolean;
  /**
   * The choice is being made, such as by the cloud: the tone pulses beside the label, and
   * nothing else can be chosen until it is done.
   */
  busy?: boolean;
  /** Where it sits: its margins, its width. Its look is its own. */
  style?: StyleProp<ViewStyle>;
  /** How tests, and end-to-end tests, find the choice. */
  testID?: string;
}

/**
 * One of a few options, all in sight, each with its label and a line on what it means: for a
 * choice that people should see whole before they make it, as Material's radio buttons are.
 * Each platform marks the option chosen its own way: on Android, a radio button leads each
 * option, as in Material's lists; on iOS, a checkmark ends the one chosen, as in Apple's lists
 * of options. Screen readers hear each option as a radio button, checked or not, with its line
 * after its name. Choosing another option ticks; the one chosen does nothing.
 */
export function ChoiceList<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  busy = false,
  style,
  testID,
}: ChoiceListProps<T>) {
  const { color } = useTheme();
  const inactive = disabled || busy;
  const leading = Platform.OS !== 'ios';
  return (
    <View testID={testID} style={[styles.choice, disabled && styles.disabled, style]}>
      <View style={styles.title}>
        <Text variant="label" style={styles.grow}>
          {label}
        </Text>
        {busy && (
          // The option chosen tells screen readers that it is busy: the dots are for the eyes.
          <View aria-hidden>
            <Pulse />
          </View>
        )}
      </View>
      <View
        accessibilityRole="radiogroup"
        style={[styles.group, { backgroundColor: color.surface }]}
      >
        {options.map((option, index) => {
          const chosen = option.value === value;
          const mark = leading ? <Radio chosen={chosen} /> : <Check chosen={chosen} />;
          return (
            <Press
              key={option.value}
              feedback="light"
              haptic={chosen ? undefined : 'select'}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityHint={option.detail}
              accessibilityState={{ checked: chosen, disabled: inactive, busy: busy && chosen }}
              disabled={inactive}
              onPress={() => {
                if (!chosen) onChange(option.value);
              }}
              style={[
                styles.option,
                index > 0 && [styles.separated, { borderTopColor: color.hairline }],
              ]}
            >
              {leading && mark}
              <View style={styles.grow}>
                <Text>{option.label}</Text>
                {option.detail !== undefined && (
                  <Text variant="caption" ink="textMuted">
                    {option.detail}
                  </Text>
                )}
              </View>
              {!leading && mark}
            </Press>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Android's mark: a radio button's ring, in the tone when chosen, around a dot that grows in, as
 * Material's does, with the spring that answers a touch. With reduce motion on, the dot fades.
 */
function Radio({ chosen }: { chosen: boolean }) {
  const { color } = useTheme();
  const { reduced } = useMotion();
  const shows = reduced ? 'opacity' : 'transform';
  const dot = reduced ? { opacity: chosen ? 1 : 0 } : { transform: [{ scale: chosen ? 1 : 0 }] };
  const transition: CSSTransitionProperties<ViewStyle> = {
    transitionProperty: [shows, 'backgroundColor'],
    transitionDuration: [reduced ? DURATION.fade : DURATION.change, TONE_BLEND.duration],
    transitionTimingFunction: [reduced ? CSS_CURVE.out : CSS_SPRING, TONE_BLEND.easing],
  };
  return (
    <Animated.View
      testID="choice-mark"
      style={[
        styles.mark,
        styles.ring,
        { borderColor: chosen ? color.accent : color.outline },
        VIEW_BLEND,
      ]}
    >
      <Animated.View
        testID="choice-dot"
        style={[styles.dot, { backgroundColor: color.accent }, dot, transition]}
      />
    </Animated.View>
  );
}

// The checkmark's arms, as bars laid out in the mark's square.
const CHECK = strokesThrough(MARK.check, MARK.size, RING_WIDTH);

/**
 * iOS's mark: a checkmark in the tone, at the end of the option chosen, which fades in as it
 * comes and out as it goes. It neither moves nor grows, so reduce motion leaves it as it is.
 */
function Check({ chosen }: { chosen: boolean }) {
  const { color } = useTheme();
  return (
    <Animated.View testID="choice-mark" style={[styles.mark, { opacity: chosen ? 1 : 0 }, FADE]}>
      {CHECK.map(({ angle, ...frame }, index) => (
        <Animated.View
          key={index}
          style={[
            styles.stroke,
            frame,
            { backgroundColor: color.accent, transform: [{ rotate: `${angle}rad` }] },
            VIEW_BLEND,
          ]}
        />
      ))}
    </Animated.View>
  );
}

const FADE: CSSTransitionProperties<ViewStyle> = {
  transitionProperty: 'opacity',
  transitionDuration: DURATION.change,
  transitionTimingFunction: CSS_CURVE.out,
};

const styles = StyleSheet.create({
  choice: { gap: SPACE.xs },
  title: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  grow: { flex: 1 },
  group: { borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden' },
  option: {
    minHeight: TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  separated: { borderTopWidth: StyleSheet.hairlineWidth },
  mark: { width: MARK.size, height: MARK.size },
  ring: {
    borderRadius: RADIUS.full,
    borderWidth: RING_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { width: MARK.dot, height: MARK.dot, borderRadius: RADIUS.full },
  stroke: { position: 'absolute', borderRadius: RING_WIDTH / 2 },
  disabled: { opacity: DISABLED_OPACITY },
});

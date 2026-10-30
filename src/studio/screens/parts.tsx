// SPDX-License-Identifier: MIT
// The studio's own parts: grouped sections, their rows, and choices among a few options.
import { Link, type Href } from 'expo-router';
import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useText } from '@/src/shared/catalog';
import {
  Press,
  RADIUS,
  RING_WIDTH,
  SPACE,
  TARGET,
  Text,
  useDesign,
  useTheme,
  VIEW_BLEND,
} from '@/src/shared/design';

import { ROBOT_TONES } from '../tones';

/** A titled group of rows on a surface, separated by hairlines. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const { color } = useTheme();
  const rows = Children.toArray(children);
  return (
    <View style={styles.section}>
      <Text variant="caption" ink="textMuted" style={styles.title}>
        {title}
      </Text>
      <View style={[styles.group, { backgroundColor: color.surface }]}>
        {rows.map((row, index) => (
          <View
            key={index}
            style={index > 0 && [styles.separated, { borderTopColor: color.hairline }]}
          >
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A row that opens a page. A row as wide as the screen lights up when pressed. */
export function LinkRow({ href, label }: { href: Href; label: string }) {
  return (
    // A Link hands its child one flat style object, which Press then animates.
    <Link href={href} asChild>
      <Press feedback="light" accessibilityLabel={label} style={styles.row}>
        <Text style={styles.grow}>{label}</Text>
        <Text ink="textMuted">›</Text>
      </Press>
    </Link>
  );
}

/** A row showing a colour: its swatch, its name and its value. */
export function ColorRow({
  name,
  value,
  detail,
}: {
  name: string;
  value: string;
  detail?: string;
}) {
  const { color } = useTheme();
  return (
    <View style={styles.row}>
      <Animated.View
        style={[styles.swatch, { backgroundColor: value, borderColor: color.hairline }, VIEW_BLEND]}
      />
      <View style={styles.grow}>
        <Text variant="bodyStrong">{name}</Text>
        <Text variant="caption" ink="textMuted">
          {detail ? `${value} · ${detail}` : value}
        </Text>
      </View>
    </View>
  );
}

/** A row with any content, at the size of the others. */
export function Row({ children }: { children: ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** One of a few options, side by side. A choice ticks under the finger. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { color } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={[styles.choice, { backgroundColor: color.fill }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Press
            key={option.value}
            feedback="light"
            haptic={selected ? undefined : 'select'}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && { backgroundColor: color.surface }]}
          >
            <Text variant="label" ink={selected ? 'text' : 'textMuted'}>
              {option.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

/** One of a set of colours, as round swatches named for screen readers, the chosen one ringed. */
export function ColorChoice({
  options,
  value,
  onChange,
}: {
  options: readonly Option<string>[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { color } = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={styles.colors}>
      {options.map(({ value: swatch, label }) => {
        const selected = swatch === value;
        return (
          <Press
            key={swatch}
            haptic={selected ? undefined : 'select'}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(swatch)}
            style={[styles.ring, { borderColor: selected ? color.accent : color.surface }]}
          >
            <View style={[styles.dot, { backgroundColor: swatch, borderColor: color.hairline }]} />
          </Press>
        );
      })}
    </View>
  );
}

/** The robot's tones, to try the app's with. */
export function ToneChoice() {
  const text = useText();
  const { tone, setTone } = useDesign();
  const options = Object.entries(ROBOT_TONES).map(([name, value]) => ({
    value,
    label: text(`studio.tone.${name}`),
  }));
  return <ColorChoice options={options} value={tone} onChange={setTone} />;
}

const styles = StyleSheet.create({
  section: { gap: SPACE.sm },
  title: { paddingHorizontal: SPACE.lg },
  group: { borderRadius: RADIUS.lg, borderCurve: 'continuous', overflow: 'hidden' },
  separated: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    minHeight: TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  grow: { flex: 1 },
  swatch: {
    width: SPACE.xxl,
    height: SPACE.xxl,
    borderRadius: RADIUS.sm,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
  },
  choice: {
    flex: 1,
    flexDirection: 'row',
    padding: SPACE.xs,
    borderRadius: RADIUS.md,
    borderCurve: 'continuous',
  },
  option: {
    flex: 1,
    minHeight: TARGET - 2 * SPACE.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.md - SPACE.xs,
    borderCurve: 'continuous',
  },
  colors: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  ring: {
    width: TARGET,
    height: TARGET,
    borderRadius: RADIUS.full,
    borderWidth: RING_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: SPACE.xxl,
    height: SPACE.xxl,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

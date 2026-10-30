// SPDX-License-Identifier: MIT
// The studio's own parts: grouped sections, their rows, and a choice among a few options.
import { Link, type Href } from 'expo-router';
import { Children, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { RADIUS, RING_WIDTH, SPACE, TARGET, Text, useTheme, VIEW_BLEND } from '@/src/shared/design';

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

/** A row that opens a page. Rows highlight when pressed; they do not scale. */
export function LinkRow({ href, label }: { href: Href; label: string }) {
  const { color } = useTheme();
  const [pressed, setPressed] = useState(false);
  // A Link hands its child one flat style object: a function or a list would be lost.
  const style = StyleSheet.flatten([styles.row, pressed && { backgroundColor: color.fill }]);
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityLabel={label}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={style}
      >
        <Text style={styles.grow}>{label}</Text>
        <Text ink="textMuted">›</Text>
      </Pressable>
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

/** One of a few options, side by side. */
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
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && { backgroundColor: color.surface }]}
          >
            <Text variant="label" ink={selected ? 'text' : 'textMuted'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One of a set of colours, as round swatches named for screen readers: the chosen one is ringed with the accent. */
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
          <Pressable
            key={swatch}
            accessibilityRole="radio"
            accessibilityLabel={label}
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(swatch)}
          >
            <Animated.View
              style={[
                styles.ring,
                { borderColor: selected ? color.accent : color.surface },
                VIEW_BLEND,
              ]}
            >
              <View
                style={[styles.dot, { backgroundColor: swatch, borderColor: color.hairline }]}
              />
            </Animated.View>
          </Pressable>
        );
      })}
    </View>
  );
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

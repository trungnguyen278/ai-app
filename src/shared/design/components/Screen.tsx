// SPDX-License-Identifier: MIT
import type { ReactNode } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../DesignProvider';
import { GUTTER, SPACE } from '../layout';

export interface ScreenProps {
  children: ReactNode;
  /** A page longer than the screen scrolls. */
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  /** How tests, and end-to-end tests, find the page. */
  testID?: string;
}

/** A screen's page: the canvas, and the content within the gutter, clear of the system's bars. */
export function Screen({ children, scroll = false, style, testID }: ScreenProps) {
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const ground = { backgroundColor: color.canvas };
  if (scroll) {
    // iOS keeps a scrolling page clear of the bars itself; Android draws behind them.
    const bottom = Platform.OS === 'ios' ? 0 : insets.bottom;
    return (
      <ScrollView
        testID={testID}
        style={ground}
        contentContainerStyle={[styles.content, { paddingBottom: SPACE.xl + bottom }, style]}
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View
      testID={testID}
      style={[
        styles.page,
        ground,
        styles.content,
        { paddingBottom: SPACE.xl + insets.bottom },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingTop: SPACE.xl, gap: SPACE.lg },
});

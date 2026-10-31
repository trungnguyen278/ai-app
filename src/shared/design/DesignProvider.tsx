// SPDX-License-Identifier: MIT
import { ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { isHex } from './color';
import { PALETTE, type Scheme } from './palette';
import { buildTheme, navigationTheme, type Theme } from './theme';

/** Light or dark as the phone is, or one of them whatever it is. */
export type Appearance = 'system' | Scheme;

/** Motion as the phone's reduce-motion setting asks, or one way whatever it asks. */
export type MotionPreference = 'system' | 'full' | 'reduced';

export interface Design {
  theme: Theme;
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  /** The tone, as #rrggbb: the robot's colour of the moment, or the default while unknown. */
  tone: string;
  setTone: (tone: string) => void;
  /** Whether motion is reduced: what would move or scale fades, and loops stop. */
  reducedMotion: boolean;
  motion: MotionPreference;
  setMotion: (motion: MotionPreference) => void;
}

const DesignContext = createContext<Design | null>(null);

/**
 * Gives the screens beneath it the theme and the motion: the phone's appearance and its
 * reduce-motion setting, or what was chosen instead, with the current tone. The navigation's
 * views, the status bar and the ground behind every screen follow the theme.
 */
export function DesignProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [appearance, setAppearance] = useState<Appearance>('system');
  const [tone, setToneValue] = useState(PALETTE.tone);
  // Reanimated reads the setting at once, as the app starts; later changes come as events.
  const reducedAtStart = useReducedMotion();
  const [systemReduced, setSystemReduced] = useState(reducedAtStart);
  const [motion, setMotion] = useState<MotionPreference>('system');
  const scheme: Scheme =
    appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance;
  const reducedMotion = motion === 'system' ? systemReduced : motion === 'reduced';
  const theme = useMemo(() => buildTheme(scheme, tone), [scheme, tone]);
  const navigation = useMemo(() => navigationTheme(theme), [theme]);
  const design = useMemo<Design>(
    () => ({
      theme,
      appearance,
      setAppearance,
      tone,
      setTone: (next) => {
        if (!isHex(next)) {
          throw new Error('a tone is a colour written #rrggbb');
        }
        setToneValue(next.toLowerCase());
      },
      reducedMotion,
      motion,
      setMotion,
    }),
    [theme, appearance, tone, reducedMotion, motion],
  );
  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setSystemReduced,
    );
    return () => subscription.remove();
  }, []);
  const canvas = theme.color.canvas;
  useEffect(() => {
    // Behind the screens, where a transition or the keyboard uncovers it.
    void SystemUI.setBackgroundColorAsync(canvas);
  }, [canvas]);
  return (
    <DesignContext value={design}>
      <ThemeProvider value={navigation}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {children}
      </ThemeProvider>
    </DesignContext>
  );
}

/** The design's state, with what changes it: the appearance, the tone and the motion. */
export function useDesign(): Design {
  const design = useContext(DesignContext);
  if (design === null) {
    throw new Error('useDesign needs a DesignProvider above it');
  }
  return design;
}

/** The current theme. */
export function useTheme(): Theme {
  return useDesign().theme;
}

/** The motion: whether it is reduced, so that what would move or scale fades, and loops stop. */
export function useMotion(): { reduced: boolean } {
  return { reduced: useDesign().reducedMotion };
}

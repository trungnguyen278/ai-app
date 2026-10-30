// SPDX-License-Identifier: MIT
// The theme and the motion follow the phone, or what was chosen, with the current tone.
import { act, screen } from '@testing-library/react-native';
import * as SystemUI from 'expo-system-ui';
import { AccessibilityInfo } from 'react-native';

import {
  buildTheme,
  deriveTone,
  FONTS,
  navigationTheme,
  PALETTE,
  Screen,
} from '@/src/shared/design';

import { design, renderScreen } from '../../render';

const mockScheme = jest.fn<string | null, []>();
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockScheme(),
}));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(async () => {}) }));
const mockReducedAtStart = jest.fn(() => false);
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReducedAtStart(),
}));

// A page of the theme's canvas.
function Page() {
  return <Screen testID="page">{null}</Screen>;
}

beforeEach(() => {
  mockScheme.mockReturnValue('light');
  mockReducedAtStart.mockReturnValue(false);
  jest.mocked(SystemUI.setBackgroundColorAsync).mockClear();
});

test.each([
  ['dark', 'dark'],
  ['light', 'light'],
  [null, 'light'],
  ['unspecified', 'light'],
] as const)("with the phone's appearance %s, the theme is %s", async (phone, scheme) => {
  mockScheme.mockReturnValue(phone);
  await renderScreen(<Page />);
  expect(design().theme.scheme).toBe(scheme);
  expect(screen.getByTestId('page')).toHaveStyle({ backgroundColor: PALETTE[scheme].canvas });
});

test("the appearance chosen wins over the phone's", async () => {
  mockScheme.mockReturnValue('dark');
  await renderScreen(<Page />);
  await act(() => design().setAppearance('light'));
  expect(design().theme.scheme).toBe('light');
  expect(screen.getByTestId('page')).toHaveStyle({ backgroundColor: PALETTE.light.canvas });
  await act(() => design().setAppearance('system'));
  expect(design().theme.scheme).toBe('dark');
});

test('the ground behind the screens follows the theme', async () => {
  await renderScreen(<Page />);
  expect(SystemUI.setBackgroundColorAsync).toHaveBeenLastCalledWith(PALETTE.light.canvas);
  await act(() => design().setAppearance('dark'));
  expect(SystemUI.setBackgroundColorAsync).toHaveBeenLastCalledWith(PALETTE.dark.canvas);
});

test("the tone starts as the robot's calm cyan, and changes", async () => {
  await renderScreen(<Page />);
  expect(design().tone).toBe(PALETTE.tone);
  await act(() => design().setTone('#FF5B6E'));
  expect(design().tone).toBe('#ff5b6e');
  expect(design().theme.color.accent).toBe(deriveTone('#ff5b6e', 'light').accent);
});

test('a tone is a colour written #rrggbb', async () => {
  await renderScreen(<Page />);
  expect(() => design().setTone('red')).toThrow('a tone is a colour written #rrggbb');
  expect(design().tone).toBe(PALETTE.tone);
});

test("the navigation's views take the theme's colours and fonts", () => {
  const theme = buildTheme('dark', PALETTE.tone);
  const navigation = navigationTheme(theme);
  expect(navigation.dark).toBe(true);
  expect(navigation.colors).toMatchObject({
    primary: theme.color.accent,
    background: PALETTE.dark.canvas,
    card: PALETTE.dark.canvas,
    text: PALETTE.dark.text,
  });
  expect(navigation.fonts.bold.fontFamily).toBe(FONTS.semibold);
});

test("motion follows the phone's reduce-motion setting, as the app starts and as it changes", async () => {
  let changed: ((reduced: boolean) => void) | undefined;
  const remove = jest.fn();
  // React Native's own mock of the listener, answering once for the provider below.
  jest.mocked(AccessibilityInfo.addEventListener).mockImplementationOnce((_, handler) => {
    changed = handler as (reduced: boolean) => void;
    return { remove };
  });
  mockReducedAtStart.mockReturnValue(true);
  const { unmount } = await renderScreen(<Page />);
  expect(design().reducedMotion).toBe(true);
  await act(() => changed?.(false));
  expect(design().reducedMotion).toBe(false);
  await unmount();
  expect(remove).toHaveBeenCalled();
});

test("the motion chosen wins over the phone's", async () => {
  mockReducedAtStart.mockReturnValue(true);
  await renderScreen(<Page />);
  await act(() => design().setMotion('full'));
  expect(design().reducedMotion).toBe(false);
  await act(() => design().setMotion('reduced'));
  expect(design().reducedMotion).toBe(true);
  await act(() => design().setMotion('system'));
  expect(design().reducedMotion).toBe(true);
});

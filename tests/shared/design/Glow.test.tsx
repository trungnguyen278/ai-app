// SPDX-License-Identifier: MIT
import { act, screen } from '@testing-library/react-native';
import { cancelAnimation, withRepeat, withTiming } from 'react-native-reanimated';

import { BREATH, Glow, TONE_BLEND } from '@/src/shared/design';

import { design, renderScreen } from '../../render';

const mockReducedAtStart = jest.fn(() => false);
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return {
    ...actual,
    useReducedMotion: () => mockReducedAtStart(),
    cancelAnimation: jest.fn(actual.cancelAnimation),
    withRepeat: jest.fn(actual.withRepeat),
    withTiming: jest.fn(actual.withTiming),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockReducedAtStart.mockReturnValue(false);
});

const breaths = () =>
  jest.mocked(withTiming).mock.calls.filter(([, config]) => config?.duration === BREATH.period / 2);

test('light is drawn on a canvas of its size, which screen readers skip', async () => {
  await renderScreen(<Glow size={200} testID="glow" />);
  expect(screen.queryByTestId('glow')).toBeNull();
  const canvas = screen.getByTestId('glow', { includeHiddenElements: true });
  expect(canvas).toHaveStyle({ width: 200, height: 200 });
});

test("breathing light breathes with the robot's breath, for ever", async () => {
  await renderScreen(<Glow size={200} breathing />);
  expect(breaths()).toHaveLength(1);
  expect(withRepeat).toHaveBeenCalledWith(expect.anything(), -1, true);
});

test('light that is not asked to breathe holds still', async () => {
  await renderScreen(<Glow size={200} />);
  expect(withRepeat).not.toHaveBeenCalled();
});

test('with reduce motion on as the app starts, breathing light holds still', async () => {
  mockReducedAtStart.mockReturnValue(true);
  await renderScreen(<Glow size={200} breathing />);
  expect(withRepeat).not.toHaveBeenCalled();
  expect(breaths()).toHaveLength(0);
});

test('when reduce motion comes on, breathing light stops', async () => {
  await renderScreen(<Glow size={200} breathing />);
  jest.clearAllMocks();
  await act(() => design().setMotion('reduced'));
  expect(cancelAnimation).toHaveBeenCalled();
  expect(withRepeat).not.toHaveBeenCalled();
});

test('when the tone changes, the light blends to it at the tone’s pace', async () => {
  await renderScreen(<Glow size={200} />);
  expect(withTiming).not.toHaveBeenCalled();
  await act(() => design().setTone('#ff5b6e'));
  expect(withTiming).toHaveBeenCalledWith(
    1,
    expect.objectContaining({ duration: TONE_BLEND.duration }),
  );
});

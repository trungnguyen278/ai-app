// SPDX-License-Identifier: MIT
// One of a few options: each a radio button to screen readers, named by its label with its line
// after it; each platform's own mark on the one chosen; a tick when the choice moves; and what
// busy and disabled leave of it.
import { act, fireEvent, screen, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Platform, StyleSheet } from 'react-native';

import { ChoiceList, DISABLED_OPACITY, MARK, RING_WIDTH } from '@/src/shared/design';
import { strokesThrough } from '@/src/shared/design/marks';

import { design, renderScreen } from '../../render';

const OPTIONS = [
  { value: 'calm', label: 'Calm', detail: 'Speaks slowly, and softly.' },
  { value: 'lively', label: 'Lively', detail: 'Speaks faster, with more in its voice.' },
] as const;
type Voice = (typeof OPTIONS)[number]['value'];

function Voices(props: { onChange?: (value: Voice) => void; disabled?: boolean; busy?: boolean }) {
  return (
    <ChoiceList
      testID="voices"
      label="Voice"
      options={OPTIONS}
      value="calm"
      onChange={props.onChange ?? (() => {})}
      disabled={props.disabled}
      busy={props.busy}
    />
  );
}

const option = (name: string) => screen.getByRole('radio', { name });
const mark = (name: string) => within(option(name)).getByTestId('choice-mark');

/** A part of the screen as the tests see it: a view or a text, and what it holds. */
type Shown = string | { props: { testID?: string }; children: Shown[] };

/** What an option holds, in order: its texts, and `mark` where its mark is. */
function sequence(node: Shown): string[] {
  if (typeof node === 'string') return [node];
  if (node.props.testID === 'choice-mark') return ['mark'];
  return node.children.flatMap(sequence);
}

afterEach(() => jest.restoreAllMocks());

test('each option is a radio button, named by its label, with its line read after it', async () => {
  await renderScreen(<Voices />);
  expect(screen.getByText('Voice')).toBeOnTheScreen();
  // The options are a group of radio buttons; the group is no element of its own, which would
  // hide them from screen readers.
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  for (const radio of screen.getAllByRole('radio')) {
    expect(radio.parent?.props).toMatchObject({ accessibilityRole: 'radiogroup' });
    expect(radio.parent?.props.accessible).toBeUndefined();
  }
  expect(option('Calm')).toBeChecked();
  expect(option('Lively')).not.toBeChecked();
  expect(option('Lively').props.accessibilityHint).toBe('Speaks faster, with more in its voice.');
  expect(screen.getByText('Speaks slowly, and softly.')).toBeOnTheScreen();
  // A hairline parts each option from the one before it.
  const line = { borderTopWidth: StyleSheet.hairlineWidth };
  expect(option('Lively')).toHaveStyle({ ...line, borderTopColor: design().theme.color.hairline });
  expect(option('Calm')).not.toHaveStyle(line);
});

test('choosing another option ticks, and the one chosen does nothing', async () => {
  const tick = jest.spyOn(Haptics, 'selectionAsync');
  const onChange = jest.fn();
  await renderScreen(<Voices onChange={onChange} />);
  await fireEvent.press(option('Lively'));
  expect(onChange).toHaveBeenCalledWith('lively');
  expect(tick).toHaveBeenCalledTimes(1);
  await fireEvent.press(option('Calm'));
  expect(onChange).toHaveBeenCalledTimes(1);
  expect(tick).toHaveBeenCalledTimes(1);
});

test('disabled, it is faint, and nothing can be chosen', async () => {
  const onChange = jest.fn();
  await renderScreen(<Voices onChange={onChange} disabled />);
  expect(screen.getByTestId('voices')).toHaveStyle({ opacity: DISABLED_OPACITY });
  expect(option('Lively')).toBeDisabled();
  await fireEvent.press(option('Lively'));
  expect(onChange).not.toHaveBeenCalled();
});

test('busy, the tone pulses for the eyes, the option chosen is busy, and nothing else can be chosen', async () => {
  const onChange = jest.fn();
  await renderScreen(<Voices onChange={onChange} busy />);
  // Screen readers hear it from the option chosen, not from the dots.
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(screen.getByRole('progressbar', { includeHiddenElements: true })).toBeTruthy();
  expect(option('Calm')).toBeBusy();
  expect(option('Lively')).not.toBeBusy();
  expect(option('Lively')).toBeDisabled();
  // Busy is not unavailable: the choice stays as clear as ever.
  expect(screen.getByTestId('voices')).not.toHaveStyle({ opacity: DISABLED_OPACITY });
  await fireEvent.press(option('Lively'));
  expect(onChange).not.toHaveBeenCalled();
});

describe('on iOS', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));

  test('a checkmark in the tone ends the option chosen, and the others have none', async () => {
    await renderScreen(<Voices />);
    expect(sequence(option('Calm')).at(-1)).toBe('mark');
    expect(mark('Calm')).toHaveStyle({ opacity: 1 });
    expect(mark('Lively')).toHaveStyle({ opacity: 0 });
    expect(within(option('Calm')).queryByTestId('choice-dot')).toBeNull();
  });
});

describe('on Android', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

  test('a radio button leads each option, ringed in the tone and with its dot when chosen', async () => {
    await renderScreen(<Voices />);
    const { color } = design().theme;
    expect(sequence(option('Lively'))[0]).toBe('mark');
    expect(mark('Calm')).toHaveStyle({ borderColor: color.accent });
    expect(mark('Lively')).toHaveStyle({ borderColor: color.outline });
    const dot = (name: string) => within(option(name)).getByTestId('choice-dot');
    expect(dot('Calm')).toHaveStyle({ transform: [{ scale: 1 }] });
    expect(dot('Lively')).toHaveStyle({ transform: [{ scale: 0 }] });
  });

  test('with reduce motion on, the dot fades in instead of growing', async () => {
    await renderScreen(<Voices />);
    await act(() => design().setMotion('reduced'));
    const dot = (name: string) => within(option(name)).getByTestId('choice-dot');
    expect(dot('Calm')).toHaveStyle({ opacity: 1 });
    expect(dot('Lively')).toHaveStyle({ opacity: 0 });
    expect(dot('Lively')).not.toHaveStyle({ transform: [{ scale: 0 }] });
  });
});

describe('the checkmark', () => {
  const strokes = strokesThrough(MARK.check, MARK.size, RING_WIDTH);
  // Where a bar's round ends are centred: along its length, half a thickness in from each end.
  const ends = ({ left, top, width, height, angle }: (typeof strokes)[number]) => {
    const reach = (width - height) / 2;
    const [x, y] = [left + width / 2, top + height / 2];
    const [dx, dy] = [reach * Math.cos(angle), reach * Math.sin(angle)];
    return [
      [x - dx, y - dy],
      [x + dx, y + dy],
    ];
  };
  const points = MARK.check.map(([x, y]) => [x * MARK.size, y * MARK.size]);

  test('is a bar for each arm, with its round ends on the points, meeting at the corner', () => {
    expect(strokes).toHaveLength(2);
    const [short, long] = strokes.map(ends);
    for (const [end, point] of [
      [short[0], points[0]],
      [short[1], points[1]],
      [long[0], points[1]],
      [long[1], points[2]],
    ]) {
      expect(end[0]).toBeCloseTo(point[0], 9);
      expect(end[1]).toBeCloseTo(point[1], 9);
    }
    for (const stroke of strokes) expect(stroke.height).toBe(RING_WIDTH);
  });

  test('stays inside its square, round ends and all', () => {
    for (const [x, y] of points) {
      for (const at of [x, y]) {
        expect(at - RING_WIDTH / 2).toBeGreaterThanOrEqual(0);
        expect(at + RING_WIDTH / 2).toBeLessThanOrEqual(MARK.size);
      }
    }
  });
});

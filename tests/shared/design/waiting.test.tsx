// SPDX-License-Identifier: MIT
// Waiting is never blank, and with reduce motion on its loops stop.
import { act, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Appear, Pulse, Skeleton, Text } from '@/src/shared/design';

import { design, renderScreen } from '../../render';

// The style as written, before Reanimated takes its CSS animations out of it.
const written = (element: { props: { jestInlineStyle?: unknown } }) =>
  StyleSheet.flatten(element.props.jestInlineStyle as object) as Record<string, unknown>;

test('a shape still loading shimmers', async () => {
  await renderScreen(<Skeleton width={120} height={16} />);
  // Screen readers skip the shape: what holds it says that it is loading.
  expect(screen.queryByTestId('shimmer')).toBeNull();
  const shimmer = screen.getByTestId('shimmer', { includeHiddenElements: true });
  expect(written(shimmer)).toHaveProperty('animationIterationCount', 'infinite');
});

test('with reduce motion on, the shimmer stops and the shape stays', async () => {
  await renderScreen(<Skeleton width={120} height={16} />);
  await act(() => design().setMotion('reduced'));
  expect(screen.queryByTestId('shimmer', { includeHiddenElements: true })).toBeNull();
});

test('the tone pulses, and says what is under way', async () => {
  await renderScreen(<Pulse label="Loading" />);
  const pulse = screen.getByRole('progressbar', { name: 'Loading' });
  expect(pulse).toBeBusy();
  const dots = pulse.children as { props: { jestInlineStyle?: unknown } }[];
  expect(dots).toHaveLength(3);
  const delays = dots.map((dot) => written(dot).animationDelay);
  expect(new Set(delays).size).toBe(3);
});

test('with reduce motion on, the dots hold still', async () => {
  await renderScreen(<Pulse label="Loading" />);
  await act(() => design().setMotion('reduced'));
  const dots = screen.getByRole('progressbar').children as {
    props: { jestInlineStyle?: unknown };
  }[];
  for (const dot of dots) {
    expect(written(dot)).not.toHaveProperty('animationName');
  }
});

test('what appears shows what it holds', async () => {
  await renderScreen(
    <Appear index={2}>
      <Text>Arrived</Text>
    </Appear>,
  );
  expect(screen.getByText('Arrived')).toBeOnTheScreen();
});

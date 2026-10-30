// SPDX-License-Identifier: MIT
import { screen } from '@testing-library/react-native';

import { deriveTone, PALETTE, Text, TYPE } from '@/src/shared/design';

import { renderScreen } from '../../render';

test("text takes its variant's style and its ink from the theme", async () => {
  await renderScreen(
    <Text variant="caption" ink="textMuted">
      Muted
    </Text>,
  );
  expect(screen.getByText('Muted')).toHaveStyle({
    ...TYPE.caption,
    color: PALETTE.light.textMuted,
  });
});

test('body text is the default', async () => {
  await renderScreen(<Text>Body</Text>);
  expect(screen.getByText('Body')).toHaveStyle({ ...TYPE.body, color: PALETTE.light.text });
});

test('text in the tone takes its accent', async () => {
  await renderScreen(<Text ink="accent">Accent</Text>);
  expect(screen.getByText('Accent')).toHaveStyle({
    color: deriveTone(PALETTE.tone, 'light').accent,
  });
});

test.each(['display', 'title', 'heading'] as const)(
  '%s is announced as a heading',
  async (variant) => {
    await renderScreen(<Text variant={variant}>Heading</Text>);
    expect(screen.getByRole('header', { name: 'Heading' })).toBeOnTheScreen();
  },
);

test('body text is not a heading', async () => {
  await renderScreen(<Text variant="body">Body</Text>);
  expect(screen.queryByRole('header')).toBeNull();
});

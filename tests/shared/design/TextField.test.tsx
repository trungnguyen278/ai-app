// SPDX-License-Identifier: MIT
// A field to type in: its label read once, its help or fault below, what it holds telling the
// keyboard, and a fault said in words as well as colour.
import { fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet } from 'react-native';

import { buildTheme, TextField } from '@/src/shared/design';

import { renderScreen } from '../../render';

const LIGHT = buildTheme('light', '#5be9ff').color;

afterEach(() => jest.restoreAllMocks());

test('the label names the field, and the hint is read with it', async () => {
  const changes = jest.fn();
  await renderScreen(
    <TextField label="Name" hint="As people see it" value="" onChangeText={changes} />,
  );
  const field = screen.getByLabelText('Name');
  expect(field.props.accessibilityHint).toBe('As people see it');
  expect(screen.getByText('As people see it')).toBeOnTheScreen();
  await fireEvent.changeText(field, 'Linh');
  expect(changes).toHaveBeenCalledWith('Linh');
});

test('a fault takes the hint’s place, in danger’s colour, and is an alert', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions');
  await renderScreen(
    <TextField
      label="Email"
      hint="Optional"
      error="Not an email"
      value="x"
      onChangeText={() => {}}
    />,
  );
  expect(screen.queryByText('Optional')).toBeNull();
  const fault = screen.getByText('Not an email');
  expect(fault).toHaveStyle({ color: LIGHT.danger });
  expect(screen.getByLabelText('Email')).toHaveStyle({ borderColor: LIGHT.danger });
  expect(screen.getByRole('alert')).toHaveTextContent('Not an email');
  expect(announce).toHaveBeenCalledWith('Not an email', { priority: 'high' });
});

test('on Android, a fault is a live region, and the hint is not', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const field = (error?: string) => (
    <TextField label="Email" hint="Optional" error={error} value="x" onChangeText={() => {}} />
  );
  const view = await renderScreen(field());
  expect(screen.getByText('Optional').props.accessibilityLiveRegion).toBeUndefined();
  await view.rerender(field('Not an email'));
  expect(screen.getByText('Not an email').props.accessibilityLiveRegion).toBe('assertive');
});

test('an email field asks for the email keyboard, and the phone may fill it', async () => {
  await renderScreen(<TextField label="Email" kind="email" value="" onChangeText={() => {}} />);
  const field = screen.getByLabelText('Email');
  expect(field.props).toMatchObject({
    keyboardType: 'email-address',
    autoComplete: 'email',
    textContentType: 'emailAddress',
    autoCapitalize: 'none',
    autoCorrect: false,
  });
});

test('focus draws the tone’s ring without moving the text', async () => {
  await renderScreen(<TextField label="Name" value="" onChangeText={() => {}} />);
  const field = screen.getByLabelText('Name');
  const before = StyleSheet.flatten(field.props.style);
  await fireEvent(field, 'focus');
  const after = StyleSheet.flatten(screen.getByLabelText('Name').props.style);
  expect(after.borderColor).toBe(LIGHT.accent);
  expect(after.borderWidth).toBeGreaterThan(before.borderWidth);
  expect(Number(before.borderWidth) + Number(before.paddingHorizontal)).toBe(
    Number(after.borderWidth) + Number(after.paddingHorizontal),
  );
});

test('a field that leads to the next keeps the keyboard; the last one lets it go', async () => {
  await renderScreen(
    <>
      <TextField label="Name" returnKeyType="next" value="" onChangeText={() => {}} />
      <TextField label="Email" returnKeyType="go" value="" onChangeText={() => {}} />
    </>,
  );
  expect(screen.getByLabelText('Name').props.submitBehavior).toBe('submit');
  expect(screen.getByLabelText('Email').props.submitBehavior).toBe('blurAndSubmit');
});

test('a disabled field cannot be changed', async () => {
  await renderScreen(<TextField label="Name" value="Linh" onChangeText={() => {}} disabled />);
  expect(screen.getByLabelText('Name').props.editable).toBe(false);
});

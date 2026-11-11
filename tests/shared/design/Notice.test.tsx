// SPDX-License-Identifier: MIT
// A notice is said by each platform's screen reader as it comes and as it changes, never again
// for a mere render: VoiceOver by an announcement, TalkBack and the web by a live region that is
// on the screen before its text.
import { screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

import { Notice } from '@/src/shared/design';

import { renderScreen } from '../../render';

// Each render of the notice's text, as the design system's Text receives it.
const mockRenders: Record<string, unknown>[] = [];
jest.mock('@/src/shared/design/components/Text', () => {
  const actual = jest.requireActual('@/src/shared/design/components/Text');
  return {
    ...actual,
    Text: (props: Record<string, unknown>) => {
      if (props.role !== undefined) mockRenders.push(props);
      return actual.Text(props);
    },
  };
});

const announce = AccessibilityInfo.announceForAccessibilityWithOptions as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRenders.length = 0;
});

afterEach(() => jest.restoreAllMocks());

async function show(notices: ReactNode) {
  const view = await renderScreen(<>{notices}</>);
  return (next: ReactNode) => view.rerender(<>{next}</>);
}

describe('on iOS', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'ios'));

  test('an alert is announced as it comes, at once and not to be cut off', async () => {
    await show(<Notice role="alert">The cloud is out of reach.</Notice>);
    expect(announce.mock.calls).toEqual([['The cloud is out of reach.', { priority: 'high' }]]);
    expect(mockRenders[0].children).toBe('The cloud is out of reach.');
    expect(screen.getByRole('alert')).toHaveTextContent('The cloud is out of reach.');
    expect(mockRenders[0]).not.toHaveProperty('accessibilityLiveRegion');
    expect(mockRenders[0]).not.toHaveProperty('aria-live');
  });

  test('a status waits behind what is being said', async () => {
    await show(<Notice role="status">Invitations are revoked.</Notice>);
    expect(announce.mock.calls).toEqual([['Invitations are revoked.', { queue: true }]]);
  });

  test('it is said again when its text changes, and never for a mere render', async () => {
    const change = await show(<Notice role="alert">First</Notice>);
    await change(
      <Notice role="alert" ink="danger">
        First
      </Notice>,
    );
    expect(announce).toHaveBeenCalledTimes(1);
    await change(<Notice role="alert">Second</Notice>);
    expect(announce.mock.calls).toEqual([
      ['First', { priority: 'high' }],
      ['Second', { priority: 'high' }],
    ]);
  });

  // Android says a live region whose mode changes (`View.setAccessibilityLiveRegion`).
  test('it is said again when its role changes, as on Android', async () => {
    const change = await show(<Notice role="status">Not sent</Notice>);
    await change(<Notice role="alert">Not sent</Notice>);
    expect(announce.mock.calls).toEqual([
      ['Not sent', { queue: true }],
      ['Not sent', { priority: 'high' }],
    ]);
  });

  test('it is said again when it comes back, or comes anew with a new key', async () => {
    const change = await show(<Notice role="alert">Refused</Notice>);
    await change(null);
    await change(<Notice role="alert">Refused</Notice>);
    await change(
      <Notice key="another" role="alert">
        Refused
      </Notice>,
    );
    expect(announce).toHaveBeenCalledTimes(3);
  });

  test('two that come together are said one after the other, in their order', async () => {
    await show(
      <>
        <Notice role="alert">Name missing</Notice>
        <Notice role="alert">Email missing</Notice>
      </>,
    );
    expect(announce.mock.calls).toEqual([
      ['Name missing', { priority: 'high' }],
      ['Email missing', { priority: 'high', queue: true }],
    ]);
  });

  test('one that comes later is said as its role asks', async () => {
    const change = await show(<Notice role="status">Saved</Notice>);
    await change(
      <>
        <Notice role="status">Saved</Notice>
        <Notice role="alert">Later</Notice>
      </>,
    );
    expect(announce.mock.calls).toEqual([
      ['Saved', { queue: true }],
      ['Later', { priority: 'high' }],
    ]);
  });
});

describe('on Android', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'android'));

  test('an alert is an assertive live region, on the screen before its text', async () => {
    await show(<Notice role="alert">The cloud is out of reach.</Notice>);
    expect(mockRenders[0]).toMatchObject({ role: 'alert', accessibilityLiveRegion: 'assertive' });
    expect(mockRenders[0].children).toBeNull();
    expect(mockRenders.at(-1)).toMatchObject({
      accessibilityLiveRegion: 'assertive',
      children: 'The cloud is out of reach.',
    });
    expect(mockRenders.at(-1)).not.toHaveProperty('aria-live');
    expect(screen.getByRole('alert')).toHaveTextContent('The cloud is out of reach.');
    expect(announce).not.toHaveBeenCalled();
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  test('a status is a polite one', async () => {
    await show(<Notice role="status">Saved</Notice>);
    expect(mockRenders.at(-1)).toMatchObject({
      role: 'status',
      accessibilityLiveRegion: 'polite',
      children: 'Saved',
    });
  });
});

describe('on the web', () => {
  beforeEach(() => jest.replaceProperty(Platform, 'OS', 'web'));

  test('a notice is a live region of its role, on the page before its text', async () => {
    await show(
      <>
        <Notice role="alert">Refused</Notice>
        <Notice role="status">Saved</Notice>
      </>,
    );
    expect(mockRenders.slice(0, 2).map((props) => props.children)).toEqual([null, null]);
    expect(mockRenders.slice(-2)).toEqual([
      expect.objectContaining({ role: 'alert', 'aria-live': 'assertive', children: 'Refused' }),
      expect.objectContaining({ role: 'status', 'aria-live': 'polite', children: 'Saved' }),
    ]);
    expect(mockRenders.at(-1)).not.toHaveProperty('accessibilityLiveRegion');
    expect(announce).not.toHaveBeenCalled();
  });
});

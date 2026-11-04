// SPDX-License-Identifier: MIT
// Reading a QR code: the reason before the phone asks, the way to the settings once it may not
// ask again, and codes taken or refused, each once.
import { act, fireEvent, screen } from '@testing-library/react-native';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import { QrScanner } from '@/src/shared/scanner';

import { camera, resetCamera } from '../mocks/camera';
import { renderScreen } from '../render';

jest.mock('expo-camera', () => jest.requireActual('../mocks/camera'));

const REASON = 'The camera reads the code on the other phone.';
const REFUSED = 'This QR code is not an invitation.';

/** The camera sees `data`. */
async function show(data: string) {
  await act(async () => camera.report?.({ type: 'qr', data }));
}

function render(onRead: (data: string) => boolean) {
  return renderScreen(<QrScanner reason={REASON} refused={REFUSED} onRead={onRead} />);
}

afterEach(() => jest.restoreAllMocks());

test('says why before the phone asks, and reads once the person agrees', async () => {
  resetCamera({ granted: false, canAskAgain: true });
  await render(() => true);
  expect(screen.getByText(REASON)).toBeOnTheScreen();
  expect(screen.queryByTestId('qr-camera')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Use the camera' }));
  expect(camera.asked).toBe(1);
  expect(screen.getByTestId('qr-camera')).toBeOnTheScreen();
  expect(screen.getByText('Point the camera at the QR code.')).toBeOnTheScreen();
});

test('leads to the settings once the phone may not ask again, and reads once back', async () => {
  resetCamera({ granted: false, canAskAgain: false });
  const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  const changes: ((status: AppStateStatus) => void)[] = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    changes.push(listener);
    return { remove: () => {} };
  });
  await render(() => true);
  expect(screen.queryByRole('button', { name: 'Use the camera' })).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
  expect(settings).toHaveBeenCalled();
  expect(camera.asked).toBe(0);
  // The person turns the camera on there, and comes back to the app.
  camera.permission = { granted: true, canAskAgain: true };
  await act(async () => changes.forEach((change) => change('active')));
  expect(screen.getByTestId('qr-camera')).toBeOnTheScreen();
});

test('a code refused is said so, once, while the camera reads on', async () => {
  resetCamera({ granted: true, canAskAgain: true });
  const onRead = jest.fn((data: string) => data === 'yes');
  await render(onRead);
  await show('no');
  expect(screen.getByText(REFUSED)).toBeOnTheScreen();
  // The camera reports a code in every frame that sees it.
  await show('no');
  expect(onRead).toHaveBeenCalledTimes(1);
  await show('yes');
  expect(onRead).toHaveBeenLastCalledWith('yes');
});

test('the first code taken is the last read', async () => {
  resetCamera({ granted: true, canAskAgain: true });
  const onRead = jest.fn(() => true);
  await render(onRead);
  await show('first');
  await show('second');
  expect(onRead.mock.calls).toEqual([['first']]);
});

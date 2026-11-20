// SPDX-License-Identifier: MIT
// Adding a device, as a person sees it (ADR-0013 of ai-platform): the explanation, Bluetooth, the
// code, the network, the name and "Ready", each failure in its own words; against simulated
// devices in set-up and the simulated cloud.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AppState, Linking, type AppStateStatus } from 'react-native';

import { MemorySecrets } from '@/src/account';
import type { CloudRequest, Transport } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import { newQueryClient } from '@/src/shared/queries';
import type { DeviceServer } from '@/src/setup';
import { groupCode, RadioProvider, SetupScreen } from '@/src/setup';

import { Account, signedIn } from '../account/render';
import { camera, resetCamera } from '../mocks/camera';
import { renderScreen } from '../render';
import { HOME, qrOf, scan, world } from './world';

jest.mock('expo-camera', () => jest.requireActual('../mocks/camera'));
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.setTimeout(60_000);

// The exchange's scrypt takes a while: each step after the code is waited for this long.
const LONG = { timeout: 20_000 };
const CONTINUE = { name: 'Continue' };
// MF2 isolates each value it places in a text (Unicode's FSI and PDI): the texts that hold one
// are read without them, and a button's name with them.
const FSI = String.fromCodePoint(0x2068);
const PDI = String.fromCodePoint(0x2069);
const UNMARKED = { normalizer: (text: string) => text.split(FSI).join('').split(PDI).join('') };
const isolated = (value: string) => FSI + value + PDI;
/** The name of a network's row, as a screen reader says it. */
const row = (network: string, status: string) => ({
  name: `${isolated(network)}, ${isolated(status)}`,
});

type World = Awaited<ReturnType<typeof world>>;

beforeEach(() => {
  resetCamera({ granted: true, canAskAgain: true });
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** The screen "Add a device" of `made`'s home, for the person whose session `secrets` holds. */
async function open(
  made: World,
  secrets: MemorySecrets = made.secrets,
  transport: Transport = made.cloud,
  queries = newQueryClient(runtimeSettings().queries),
) {
  await renderScreen(
    <Account transport={transport} secrets={secrets} queries={queries}>
      <RadioProvider radio={made.radio}>
        <SetupScreen homeId={made.home.id} />
      </RadioProvider>
    </Account>,
  );
  await screen.findByText(/^(Add a device to|Only the home's owner)/, undefined, LONG);
}

/** Past the explanation and Bluetooth, to the camera. */
async function toCamera() {
  await fireEvent.press(await screen.findByRole('button', CONTINUE));
  await waitFor(() => expect(camera.report).toBeDefined());
}

/** The camera sees `text`. */
async function show(text: string) {
  await act(async () => camera.report?.({ type: 'qr', data: text }));
}

async function type(testID: string, text: string) {
  await fireEvent.changeText(screen.getByTestId(testID), text);
}

/** `made`, with its device opened to set-up and on to the device's networks. */
async function toNetworks(made: World) {
  await open(made);
  await toCamera();
  await show(qrOf(made.devices[0]));
  await screen.findByText('Choose a Wi-Fi network for the device', undefined, LONG);
}

/** `cloud`, which keeps each request it is sent in `sent`. */
function recording(cloud: Transport, sent: CloudRequest[]): Transport {
  return {
    send: async (request: CloudRequest) => {
      sent.push(request);
      return cloud.send(request);
    },
  };
}

/** A cloud that cannot serve the first challenge it is asked for. */
function failingOnce(cloud: Transport): Transport {
  let failed = false;
  return {
    send: async (request: CloudRequest) => {
      if (!failed && request.target.endsWith('/device-challenges')) {
        failed = true;
        return { status: 503, headers: {}, body: '' };
      }
      return cloud.send(request);
    },
  };
}

describe('adding a device', () => {
  test('by its QR code: the network, its password, the name, then ready', async () => {
    const made = await world({ radio: { state: 'ask' } });
    const [device] = made.devices;
    await open(made);
    expect(
      await screen.findByRole('header', { name: `Add a device to ${isolated('Nhà Linh')}` }),
    ).toBeTruthy();
    expect(made.radio.asked).toBe(0);
    await toCamera();
    expect(made.radio.asked).toBe(1);

    await show(qrOf(device));
    const secured = await screen.findByRole('button', row('Nhà Linh', 'Secured'), LONG);
    expect(screen.getByRole('button', row('Quán cà phê', 'Open'))).toBeOnTheScreen();
    expect(
      screen.getByRole('button', row('Văn phòng', 'Cannot be used for set-up')),
    ).toBeDisabled();
    // Hidden networks are not listed: they have their own row.
    expect(screen.queryByRole('button', { name: /Ẩn/ })).toBeNull();
    await fireEvent.press(secured);
    expect(await screen.findByText('Password for Nhà Linh', UNMARKED)).toBeOnTheScreen();

    // Too short for WPA2: said before the device is asked.
    await type('setup-password', 'sai');
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(
      screen.getByText('Type 8 to 63 characters, or 64 hexadecimal digits.'),
    ).toBeOnTheScreen();

    expect(screen.getByTestId('setup-password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show the password' }));
    expect(screen.getByTestId('setup-password').props.secureTextEntry).toBeFalsy();
    expect(screen.getByRole('button', { name: 'Hide the password' })).toBeOnTheScreen();

    await type('setup-password', 'sai mật khẩu');
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(
      await screen.findByText('The network refused the password. Check it, then try again.'),
    ).toBeOnTheScreen();

    await type('setup-password', 'mật khẩu nhà');
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();
    expect(
      screen.getByText(
        'It is in Nhà Linh now, under the name that everyone in the home sees.',
        UNMARKED,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('setup-name').props.value).toBe('Robot');

    await type('setup-name', '  Bé Na ');
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(
      await screen.findByRole('header', { name: `${isolated('Bé Na')} is ready` }),
    ).toBeTruthy();
    expect(screen.getByText('Bé Na is online in the home.', UNMARKED)).toBeOnTheScreen();
    const { devices } = await made.api.devices(made.home.id);
    expect(devices.map((each) => each.name)).toEqual(['Bé Na']);

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.replace).toHaveBeenCalledWith(
      `/homes/${made.home.id}/devices/${device.id.toLowerCase()}`,
    );
  });

  test('by its typed code, beside which a device shows its discriminator', async () => {
    const made = await world({ devices: [{}, { joined: 'Quán cà phê' }] });
    const [, device] = made.devices;
    await open(made);
    await toCamera();
    await fireEvent.press(screen.getByRole('button', { name: 'Type the code instead' }));

    await type('setup-code', '1234');
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(screen.getByText('Type the 8 digits that the device shows.')).toBeOnTheScreen();

    await type('setup-code', groupCode(device.secret.code));
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(
      await screen.findByText(
        'Several devices nearby are in set-up. To find this one, type the 4 characters shown beside its code.',
      ),
    ).toBeOnTheScreen();

    await type('setup-discriminator', 'G');
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(screen.getByText('Type the 4 characters shown beside the code.')).toBeOnTheScreen();

    await type('setup-discriminator', device.secret.discriminator.toLowerCase());
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    // On a network that reaches the Internet already: no network to choose.
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();

    await type('setup-name', ' ');
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(screen.getByText('Type a name of up to 100 characters.')).toBeOnTheScreen();

    // Renamed meanwhile, on another phone: said so, and what the person typed is sent again.
    const id = device.id.toLowerCase();
    const added = await made.api.device(made.home.id, id);
    await made.api.updateDevice(made.home.id, id, { name: 'Bi' }, added.etag!);
    await type('setup-name', 'Bé Na');
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(
      await screen.findByText(
        'Someone renamed this device meanwhile. Continue to give it the name you typed, or change it first.',
      ),
    ).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Bé Na')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(
      await screen.findByRole('header', { name: `${isolated('Bé Na')} is ready` }),
    ).toBeTruthy();
  });

  test('the name unchanged is accepted with one tap', async () => {
    const made = await world({ devices: [{ joined: 'Quán cà phê', device: { name: 'Bé Na' } }] });
    const sent: CloudRequest[] = [];
    await open(made, made.secrets, recording(made.cloud, sent));
    await toCamera();
    await show(qrOf(made.devices[0]));
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(
      await screen.findByRole('header', { name: `${isolated('Bé Na')} is ready` }),
    ).toBeTruthy();
    // The name it was registered with is its own already: nothing is renamed (ADR-0013, 3).
    expect(sent.filter((request) => request.method === 'PATCH')).toEqual([]);
  });

  test('a network that hides its name', async () => {
    const made = await world();
    await toNetworks(made);
    await fireEvent.press(screen.getByRole('button', { name: 'Other network…' }));
    expect(await screen.findByRole('header', { name: 'Other network' })).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(
      screen.getByText(
        "Type the network's name: up to 32 characters, fewer with accents or symbols.",
      ),
    ).toBeOnTheScreen();

    await type('setup-hidden-name', 'ẩn');
    await fireEvent.press(screen.getByRole('radio', { name: 'WPA3 Personal' }));
    await type('setup-password', 'bí mật');
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(
      await screen.findByText(
        'The device found no network by that name. Check the name, in which capitals count, and the security. Or make the network visible for a while, and choose it in the list.',
      ),
    ).toBeOnTheScreen();
    // The name and the security stay, to be corrected; the password is typed again.
    expect(screen.getByTestId('setup-hidden-name').props.value).toBe('ẩn');
    expect(screen.getByTestId('setup-password').props.value).toBe('');
    expect(screen.getByRole('radio', { name: 'WPA3 Personal' })).toBeChecked();
    await type('setup-hidden-name', 'Ẩn');
    await type('setup-password', 'bí mật');
    await fireEvent.press(screen.getByRole('button', { name: 'Join' }));
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();
  });

  test('back to the networks, and a look again', async () => {
    const made = await world();
    await toNetworks(made);
    await fireEvent.press(screen.getByRole('button', { name: 'Other network…' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Back to the networks' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Look again' }));
    expect(await screen.findByRole('button', row('Quán cà phê', 'Open'), LONG)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', row('Quán cà phê', 'Open')));
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();
  });

  test('one of the home, given another network', async () => {
    const made = await world({ devices: [{ joined: 'Quán cà phê' }] });
    const [device] = made.devices;
    await scan(made.start().flow, device);
    device.openSetUp();
    await toNetworks(made);
    await fireEvent.press(screen.getByRole('button', row('Quán cà phê', 'Saved')));
    expect(await screen.findByRole('header', { name: 'New network' }, LONG)).toBeTruthy();
    expect(
      screen.getByText(
        'The device is joining Quán cà phê, and is back online in its home in a moment.',
        UNMARKED,
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.replace).toHaveBeenCalledWith(
      `/homes/${made.home.id}/devices/${device.id.toLowerCase()}`,
    );
  });

  test('a device that comes online a moment later: ready, once the devices are read again', async () => {
    // The device reaches the cloud only when the test says so, as if its network were slow.
    const later: { arrive?: () => void } = {};
    let cloud: DeviceServer | undefined;
    const reach = (): DeviceServer => ({
      connectDevice: (key, hello) => {
        later.arrive = () => cloud?.connectDevice(key, hello);
        return true;
      },
    });
    const made = await world({ devices: [{ joined: 'Quán cà phê', reach }] });
    cloud = made.cloud;
    await open(made);
    await toCamera();
    await show(qrOf(made.devices[0]));
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();
    jest.useFakeTimers();
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(await screen.findByText('Waiting for Robot to come online', UNMARKED)).toBeOnTheScreen();
    later.arrive?.();
    await act(async () => {
      jest.advanceTimersByTime(runtimeSettings().setup.online_poll * 1000);
    });
    expect(await screen.findByText('Robot is online in the home.', UNMARKED)).toBeOnTheScreen();
  });

  test('a device that does not come online: said, after a while, and its page', async () => {
    const made = await world({ devices: [{ joined: 'Quán cà phê', reach: () => undefined }] });
    const [device] = made.devices;
    await open(made);
    await toCamera();
    await show(qrOf(device));
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();
    jest.useFakeTimers();
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(await screen.findByText('Waiting for Robot to come online', UNMARKED)).toBeOnTheScreen();
    const late =
      'Robot is not online yet. Check that it is on, and within reach of its Wi-Fi network. Its page shows when it comes online.';
    expect(screen.queryByText(late, UNMARKED)).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(runtimeSettings().setup.online_timeout * 1000);
    });
    expect(screen.getByText(late, UNMARKED)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open its page' }));
    expect(router.replace).toHaveBeenCalledWith(
      `/homes/${made.home.id}/devices/${device.id.toLowerCase()}`,
    );
  });
});

describe('who may add devices', () => {
  test("a member is told it is the owner's and the admins'", async () => {
    const made = await world();
    const minh = await signedIn('Minh', made.cloud);
    const { code } = await made.api.createInvitation(made.home.id);
    await minh.api.acceptInvitation(code);
    await open(made, minh.secrets);
    expect(
      await screen.findByText("Only the home's owner and its admins can add devices."),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', CONTINUE)).toBeNull();
  });
});

describe('Bluetooth', () => {
  test('refused: the way to the settings, and on once the person comes back', async () => {
    const listeners: ((status: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener) => {
      listeners.push(listener);
      return { remove: () => undefined };
    });
    const settings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const made = await world({ radio: { state: 'ask', answer: 'blocked' } });
    await open(made);
    await fireEvent.press(await screen.findByRole('button', CONTINUE));
    expect(
      await screen.findByText(
        "Bluetooth is turned off for the app, which needs it to find the device. You can turn it on in the phone's settings.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open settings' }));
    expect(settings).toHaveBeenCalledTimes(1);

    made.radio.current = 'ready';
    await act(async () => listeners.forEach((listener) => listener('background')));
    expect(screen.queryByRole('button', { name: 'Type the code instead' })).toBeNull();
    await act(async () => listeners.forEach((listener) => listener('active')));
    expect(await screen.findByRole('button', { name: 'Type the code instead' })).toBeOnTheScreen();
  });

  test('off: turned on, and tried again', async () => {
    const made = await world({ radio: { state: 'off' } });
    await open(made);
    await fireEvent.press(await screen.findByRole('button', CONTINUE));
    expect(
      await screen.findByText('Bluetooth is off. Turn it on, then try again.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Open location settings' })).toBeNull();
    made.radio.current = 'ready';
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Type the code instead' })).toBeOnTheScreen();
  });

  test('Location off, before Android 12: its settings opened, and tried again', async () => {
    const intent = jest.spyOn(Linking, 'sendIntent').mockResolvedValue();
    const made = await world({ radio: { state: 'location' } });
    await open(made);
    await fireEvent.press(await screen.findByRole('button', CONTINUE));
    expect(
      await screen.findByText(
        'Location is off. This phone finds Bluetooth devices only while Location is on: turn it on, then try again.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Open settings' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Open location settings' }));
    expect(intent).toHaveBeenCalledWith('android.settings.LOCATION_SOURCE_SETTINGS');
    made.radio.current = 'ready';
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Type the code instead' })).toBeOnTheScreen();
  });

  test('Location off, on a phone without its page of the settings: nothing thrown', async () => {
    jest.spyOn(Linking, 'sendIntent').mockRejectedValue(new Error('no such page'));
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const made = await world({ radio: { state: 'location' } });
      await open(made);
      await fireEvent.press(await screen.findByRole('button', CONTINUE));
      await fireEvent.press(await screen.findByRole('button', { name: 'Open location settings' }));
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('when something goes wrong', () => {
  test('a wrong code: said, and the new one asked for', async () => {
    const made = await world();
    const [device] = made.devices;
    await open(made);
    await toCamera();
    await fireEvent.press(screen.getByRole('button', { name: 'Type the code instead' }));
    await type('setup-code', device.secret.code === '00000000' ? '11111111' : '00000000');
    await fireEvent.press(screen.getByRole('button', CONTINUE));
    expect(
      await screen.findByText(
        'That code was not the right one, and the device shows a new one now. Scan or type the new code.',
        undefined,
        LONG,
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    // Back to the camera, which reads the new code.
    await waitFor(() => expect(camera.report).toBeDefined());
    await fireEvent.press(screen.getByRole('button', { name: 'Type the code instead' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Scan the QR code instead' }));
    await waitFor(() => expect(camera.report).toBeDefined());
  });

  test('a QR code that is no set-up code, then one of a newer app', async () => {
    const made = await world();
    await open(made);
    await toCamera();
    await show('https://example.com/menu');
    expect(screen.getByText("This QR code is not a device's set-up code.")).toBeOnTheScreen();
    await show('setup:99:1A2B:12345678');
    expect(
      await screen.findByText(
        'This device needs a newer version of the app. Update the app, then try again.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    // Opened by a link, with nothing below it: the home.
    jest.mocked(router.canGoBack).mockReturnValueOnce(false);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(`/homes/${made.home.id}`);
  });

  test("the cloud's failures in the cloud's words, and trying again", async () => {
    const made = await world({ devices: [{ joined: 'Quán cà phê' }] });
    await open(made, made.secrets, failingOnce(made.cloud));
    await toCamera();
    await show(qrOf(made.devices[0]));
    expect(
      await screen.findByText('The cloud cannot serve just now. Try again later.', undefined, LONG),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();
  });

  test('a device in another home', async () => {
    const made = await world({ devices: [{ joined: 'Quán cà phê' }] });
    const minh = await signedIn('Minh', made.cloud);
    const home = await minh.api.createHome({ ...HOME, name: 'Nhà Minh' });
    await scan(made.start({ api: minh.api, home }).flow, made.devices[0]);
    made.devices[0].openSetUp();
    await open(made);
    await toCamera();
    await show(qrOf(made.devices[0]));
    expect(
      await screen.findByText(
        'This device is in another home. Someone there must remove it from that home, or the device must be reset, before it can join this one.',
        undefined,
        LONG,
      ),
    ).toBeOnTheScreen();
  });

  test('leaving the screen ends the session, and the device stays in set-up', async () => {
    const made = await world();
    await toNetworks(made);
    expect(made.devices[0].advertising).toBe(false);
    await screen.unmount();
    await waitFor(() => expect(made.devices[0].advertising).toBe(true));
  });

  test('a read of the homes that fails in the background keeps the session', async () => {
    const made = await world();
    const failing = { homes: false };
    const transport: Transport = {
      send: async (request: CloudRequest) =>
        failing.homes && request.method === 'GET' && /\/homes(\?|$)/.test(request.target)
          ? { status: 503, headers: {}, body: '' }
          : made.cloud.send(request),
    };
    const queries = newQueryClient(runtimeSettings().queries);
    await open(made, made.secrets, transport, queries);
    await toCamera();
    await show(qrOf(made.devices[0]));
    await screen.findByText('Choose a Wi-Fi network for the device', undefined, LONG);

    // The person comes back to the app, which reads the homes again, and the cloud cannot answer.
    failing.homes = true;
    await act(async () => {
      await queries.invalidateQueries();
    });
    expect(queries.getQueryState(['homes'])?.status).toBe('error');
    expect(screen.getByText('Choose a Wi-Fi network for the device')).toBeOnTheScreen();
    expect(made.devices[0].advertising).toBe(false);
    failing.homes = false;
    await fireEvent.press(screen.getByRole('button', row('Quán cà phê', 'Open')));
    expect(await screen.findByRole('header', { name: 'Name the device' }, LONG)).toBeTruthy();
  });
});

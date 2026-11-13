// SPDX-License-Identifier: MIT
// A home's devices, on the simulated cloud: the list on the home's screen, a device's page as
// each role sees it, renaming it with its ETag, and removing it, which the phone's own dialog
// confirms first and which leaves the device as it is (PROV-4).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert, type AlertButton } from 'react-native';

import type { QueryClient } from '@tanstack/react-query';

import { DeviceScreen, HomeDevices } from '@/src/devices';
import { HomeScreen, PersonScreen } from '@/src/homes';
import type { CloudRequest, CloudResponse, DeviceDescription, Transport } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import { newQueryClient } from '@/src/shared/queries';

import { Account, signedIn, simulatedCloud } from '../account/render';
import { renderScreen } from '../render';
import { HELLO, Robot } from '../shared/cloud/robot';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true },
}));

const HOME = { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi'] };
// The cloud's time stands still, so that the day a device was added reads the same every run,
// in the phone's time zone, which is UTC in the tests (jest.config.js).
const NOW = Date.parse('2026-11-03T08:10:00Z');
// Whether MF2 isolates a date depends on what the platform's Intl says of its direction, so the
// texts with one are read without the isolating marks.
const unmarked = { normalizer: (text: string) => text.replace(/[\u2066-\u2069]/g, '') };
const LAMP: DeviceDescription = { kind: 'lamp', model: 'lamp-1', software: '2.0.1' };
const REMOVE = 'Remove from the home';
const SAVE = 'Save the name';

/**
 * Linh's home: Linh the owner, An an admin and Minh a member. Each person's session, and a way
 * to add a device, as set-up does, named or not, and online with what its hello says, if given.
 */
async function household() {
  const linh = await signedIn(
    'Linh',
    simulatedCloud(() => NOW),
  );
  const home = await linh.api.createHome(HOME);
  const people = { an: await signedIn('An', linh.cloud), minh: await signedIn('Minh', linh.cloud) };
  for (const person of Object.values(people)) {
    const { code } = await linh.api.createInvitation(home.id);
    await person.api.acceptInvitation(code);
  }
  const member = async (name: string) =>
    (await linh.api.members(home.id)).members.find((each) => each.display_name === name)!;
  const an = await member('An');
  await linh.api.updateMember(home.id, an.id, { role: 'admin' }, an.etag);
  let robots = 0;
  return {
    home,
    cloud: linh.cloud,
    sessions: { linh: linh.secrets, an: people.an.secrets, minh: people.minh.secrets },
    api: linh.api,
    member,
    async add(name?: string, hello?: DeviceDescription) {
      robots += 1;
      const robot = new Robot(`4a4ce4bd-2853-43d8-98dc-${String(robots).padStart(12, '0')}`);
      const { challenge, server } = await linh.api.createDeviceChallenge(home.id);
      const registration = robot.register(challenge, server);
      const { device } = await linh.api.registerDevice(home.id, { registration, name });
      if (hello !== undefined) linh.cloud.connectDevice(robot.key, hello);
      return device;
    },
    /** The device `id`, as the cloud has it now. */
    device: (id: string) => linh.api.device(home.id, id),
    names: async () => (await linh.api.devices(home.id)).devices.map((device) => device.name),
  };
}

type Household = Awaited<ReturnType<typeof household>>;
type Viewer = keyof Household['sessions'];

interface Looking {
  queries?: QueryClient;
  transport?: Transport;
  languages?: string[];
}

/** `viewer` looks at the home's screen, with its devices, as the routes compose it. */
async function lookAtHome(at: Household, viewer: Viewer, looking: Looking = {}) {
  await renderScreen(
    <Account
      transport={looking.transport ?? at.cloud}
      secrets={at.sessions[viewer]}
      queries={looking.queries}
    >
      <HomeScreen homeId={at.home.id} devices={(home) => <HomeDevices home={home} />} />
    </Account>,
    looking.languages,
  );
  await screen.findByRole('header', { name: /^(Devices|Thiết bị)$/ });
}

/** `viewer` looks at the page of the device `deviceId`, once it is read. */
async function look(at: Household, viewer: Viewer, deviceId: string, looking: Looking = {}) {
  await renderScreen(
    <Account
      transport={looking.transport ?? at.cloud}
      secrets={at.sessions[viewer]}
      queries={looking.queries}
    >
      <DeviceScreen homeId={at.home.id} deviceId={deviceId} />
    </Account>,
    looking.languages,
  );
  await screen.findByRole('header', { name: /^(About this device|Thông tin thiết bị)$/ });
}

/** A cloud of app API 1.4, which has no renaming: its devices come without an ETag. */
class WithoutETags implements Transport {
  constructor(private readonly cloud: Transport) {}

  async send(request: CloudRequest): Promise<CloudResponse> {
    const response = await this.cloud.send(request);
    if (request.method !== 'GET' || !request.target.includes('/devices')) return response;
    const body = JSON.parse(response.body) as { devices: Record<string, unknown>[] };
    for (const device of body.devices) delete device.etag;
    return { ...response, body: JSON.stringify(body) };
  }
}

/** The cloud as the page reaches it, whose readings of the devices wait, once `hold` is set,
 *  until `release`. */
class Held implements Transport {
  hold = false;
  readonly waiting: (() => void)[] = [];

  constructor(private readonly cloud: Transport) {}

  async send(request: CloudRequest): Promise<CloudResponse> {
    if (this.hold && request.method === 'GET' && request.target.includes('/devices')) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    return this.cloud.send(request);
  }

  release() {
    this.hold = false;
    for (const send of this.waiting.splice(0)) send();
  }
}

/** The phone's dialog, as the app asked for it: its title, message and buttons. */
function dialogs() {
  return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
}

function press(alert: ReturnType<typeof dialogs>, style: AlertButton['style']) {
  const buttons: AlertButton[] = alert.mock.calls.at(-1)?.[2] ?? [];
  buttons.find((button) => button.style === style)?.onPress?.();
}

// The router's stand-ins keep their calls from one test to the next unless cleared.
beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe("the home's devices", () => {
  test('each by its name, and whether it is online, leading to its page', async () => {
    const at = await household();
    await at.add('Bi', HELLO);
    await at.add('Bo');
    // A member sees the devices too: only renaming and removing are the owner's and admins'.
    await lookAtHome(at, 'minh');
    expect(await screen.findByText('Bi')).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: '\u2068Bi\u2069, \u2068Online\u2069' }));
    expect(screen.getByRole('link', { name: '\u2068Bo\u2069, \u2068Offline\u2069' }));
    expect(screen.getByText('Online')).toBeOnTheScreen();
    expect(screen.getByText('Offline')).toBeOnTheScreen();
  });

  test('a home without devices says so', async () => {
    const at = await household();
    await lookAtHome(at, 'linh');
    expect(await screen.findByText('No devices in this home yet.')).toBeOnTheScreen();
  });

  test('a device without a name goes by what it is, in the phone’s language', async () => {
    const at = await household();
    await at.add(undefined, HELLO);
    await at.add(undefined, LAMP);
    await at.add();
    await lookAtHome(at, 'linh', { languages: ['vi'] });
    expect(await screen.findByText('Robot')).toBeOnTheScreen();
    expect(screen.getAllByText('Thiết bị', { exact: true })).toHaveLength(3);
    expect(screen.getAllByText('Trực tuyến')).toHaveLength(2);
    expect(screen.getByText('Ngoại tuyến')).toBeOnTheScreen();
  });
});

describe('what each role is offered', () => {
  test('the owner and an admin rename and remove a device', async () => {
    const at = await household();
    const bi = await at.add('Bi', HELLO);
    for (const viewer of ['linh', 'an'] as const) {
      await look(at, viewer, bi.id);
      expect(screen.getByTestId('device-name')).toBeOnTheScreen();
      expect(screen.getByDisplayValue('Bi')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: REMOVE })).toBeOnTheScreen();
      await screen.unmount();
    }
  });

  test('a member sees the device, and neither renames nor removes it', async () => {
    const at = await household();
    await at.add('Bo');
    const bi = await at.add('Bi', HELLO);
    await look(at, 'minh', bi.id);
    expect(screen.getByText('Bi')).toBeOnTheScreen();
    expect(screen.getByText('Online')).toBeOnTheScreen();
    expect(screen.queryByTestId('device-name')).toBeNull();
    expect(screen.queryByRole('button', { name: REMOVE })).toBeNull();
  });

  test('a device from a cloud that cannot rename it is shown, and removed, but not renamed', async () => {
    const at = await household();
    const bi = await at.add('Bi');
    await look(at, 'linh', bi.id, { transport: new WithoutETags(at.cloud) });
    expect(screen.getByText('Bi')).toBeOnTheScreen();
    expect(screen.queryByTestId('device-name')).toBeNull();
    expect(screen.getByRole('button', { name: REMOVE })).toBeOnTheScreen();
  });
});

describe('what the page says of the device', () => {
  test('what it is, once it has said, and when it was added', async () => {
    const at = await household();
    const bi = await at.add('Bi', HELLO);
    await look(at, 'linh', bi.id);
    expect(screen.getByText('Online')).toBeOnTheScreen();
    for (const [label, value] of [
      ['Type', 'Robot'],
      ['Model', 'concept-v0'],
      ['Software version', '0.4.0'],
    ]) {
      expect(screen.getByText(label)).toBeOnTheScreen();
      expect(screen.getByText(value)).toBeOnTheScreen();
    }
    expect(screen.getByText('Added to the home')).toBeOnTheScreen();
    expect(screen.getByText('November 3, 2026', unmarked)).toBeOnTheScreen();
  });

  test('before its first hello, only that it is a device, and when it was added', async () => {
    const at = await household();
    const device = await at.add();
    await look(at, 'minh', device.id, { languages: ['vi'] });
    expect(screen.getByText('Ngoại tuyến')).toBeOnTheScreen();
    // Its name and its kind: a device, until it says what it is.
    expect(screen.getAllByText('Thiết bị')).toHaveLength(2);
    expect(screen.queryByText('Mẫu')).toBeNull();
    expect(screen.queryByText('Phiên bản phần mềm')).toBeNull();
    expect(screen.getByText('Ngày thêm vào nhà')).toBeOnTheScreen();
    expect(screen.getByText('3 tháng 11, 2026', unmarked)).toBeOnTheScreen();
  });

  test('a kind the app does not know is a device, with what it said of itself', async () => {
    const at = await household();
    const lamp = await at.add(undefined, LAMP);
    await look(at, 'linh', lamp.id);
    expect(screen.getByDisplayValue('Device')).toBeOnTheScreen();
    expect(screen.getByText('lamp-1')).toBeOnTheScreen();
    expect(screen.getByText('2.0.1')).toBeOnTheScreen();
  });

  test('a device no longer in the home is said so', async () => {
    const at = await household();
    const bi = await at.add('Bi');
    await at.api.removeDevice(at.home.id, bi.id);
    await renderScreen(
      <Account transport={at.cloud} secrets={at.sessions.linh}>
        <DeviceScreen homeId={at.home.id} deviceId={bi.id} />
      </Account>,
    );
    expect(await screen.findByText('This device is no longer in the home.')).toBeOnTheScreen();
  });
});

describe('renaming', () => {
  test("changes the device's name in the home", async () => {
    const at = await household();
    const bi = await at.add('Bi');
    await look(at, 'an', bi.id);
    expect(screen.queryByRole('button', { name: SAVE })).toBeNull();
    // Spaces around the same name change nothing.
    await fireEvent.changeText(screen.getByTestId('device-name'), 'Bi ');
    expect(screen.queryByRole('button', { name: SAVE })).toBeNull();
    await fireEvent.changeText(screen.getByTestId('device-name'), '  Bi Bo ');
    await fireEvent.press(screen.getByRole('button', { name: SAVE }));
    await waitFor(() => expect(screen.queryByRole('button', { name: SAVE })).toBeNull());
    expect(screen.getByDisplayValue('Bi Bo')).toBeOnTheScreen();
    expect((await at.device(bi.id)).name).toBe('Bi Bo');
  });

  test("the home's list has the new name at once, while the devices are read again", async () => {
    const at = await household();
    const bi = await at.add('Bi');
    const held = new Held(at.cloud);
    await renderScreen(
      <Account transport={held} secrets={at.sessions.linh}>
        <HomeDevices home={at.home} />
        <DeviceScreen homeId={at.home.id} deviceId={bi.id} />
      </Account>,
    );
    await screen.findByTestId('device-name');
    held.hold = true;
    await fireEvent.changeText(screen.getByTestId('device-name'), 'Bi Bo');
    await fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(await screen.findByText('Bi Bo')).toBeOnTheScreen();
    expect(held.waiting).toHaveLength(1);
    held.release();
    await waitFor(() => expect(screen.queryByRole('button', { name: SAVE })).toBeNull());
  });

  test('a name changed meanwhile is said so, and the change can be saved again', async () => {
    const at = await household();
    const bi = await at.add('Bi');
    await look(at, 'linh', bi.id);
    await at.api.updateDevice(at.home.id, bi.id, { name: 'Bé Bi' }, bi.etag!);
    await fireEvent.changeText(screen.getByTestId('device-name'), 'Bi Bo');
    await fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(
      await screen.findByText(
        'Someone changed this device meanwhile, and the page shows it as it is now. Save again if you still want your change.',
      ),
    ).toBeOnTheScreen();
    // What the person typed stays, and saving now goes over the name read since.
    expect(screen.getByDisplayValue('Bi Bo')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: SAVE }));
    await waitFor(async () => expect((await at.device(bi.id)).name).toBe('Bi Bo'));
  });

  test('needs a name, of up to 100 characters', async () => {
    const at = await household();
    const bi = await at.add('Bi');
    await look(at, 'linh', bi.id);
    for (const name of ['   ', 'B'.repeat(101)]) {
      await fireEvent.changeText(screen.getByTestId('device-name'), name);
      await fireEvent.press(screen.getByRole('button', { name: SAVE }));
      expect(screen.getByText('Type a name of up to 100 characters.')).toBeOnTheScreen();
    }
    // A hundred characters are a name; two devices may share one.
    await at.add('B'.repeat(100));
    await fireEvent.changeText(screen.getByTestId('device-name'), 'B'.repeat(100));
    await fireEvent.press(screen.getByRole('button', { name: SAVE }));
    await waitFor(() => expect(screen.queryByRole('button', { name: SAVE })).toBeNull());
    expect(screen.queryByText('Type a name of up to 100 characters.')).toBeNull();
    expect(await at.names()).toEqual(['B'.repeat(100), 'B'.repeat(100)]);
  });

  test('a role taken away while the page is open is said so, not as a change meanwhile', async () => {
    const at = await household();
    const bi = await at.add('Bi');
    await look(at, 'an', bi.id);
    // The owner makes An a member again, while An's page still offers the admin's rename.
    const an = await at.member('An');
    await at.api.updateMember(at.home.id, an.id, { role: 'member' }, an.etag);
    await fireEvent.changeText(screen.getByTestId('device-name'), 'Bi Bo');
    await fireEvent.press(screen.getByRole('button', { name: SAVE }));
    expect(
      await screen.findByText('Your role in this home does not allow this.'),
    ).toBeOnTheScreen();
    expect((await at.device(bi.id)).name).toBe('Bi');
  });
});

describe('removing', () => {
  test('asks first, says what stays on the device, and removes it only once agreed', async () => {
    const at = await household();
    const bi = await at.add('Bi', HELLO);
    const alert = dialogs();
    await look(at, 'linh', bi.id);
    await fireEvent.press(screen.getByRole('button', { name: REMOVE }));
    expect(alert).toHaveBeenCalledWith(
      'Remove \u2068Bi\u2069?',
      'It leaves \u2068Nhà Linh\u2069, and can be set up again. It keeps its Wi-Fi network, its name and its settings: reset it to its factory settings before you give it to someone else.',
      expect.any(Array),
    );
    press(alert, 'cancel');
    expect(await at.names()).toEqual(['Bi']);
    await fireEvent.press(screen.getByRole('button', { name: REMOVE }));
    press(alert, 'destructive');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await at.names()).toEqual([]);
  });

  test('in Vietnamese, the dialog says the same', async () => {
    const at = await household();
    const bi = await at.add('Bi');
    const alert = dialogs();
    await look(at, 'an', bi.id, { languages: ['vi'] });
    await fireEvent.press(screen.getByRole('button', { name: 'Xoá khỏi nhà' }));
    expect(alert.mock.calls[0].slice(0, 2)).toEqual([
      'Xoá \u2068Bi\u2069 khỏi nhà?',
      'Thiết bị sẽ rời \u2068Nhà Linh\u2069, và có thể được cài đặt lại. Nó vẫn giữ mạng Wi-Fi, tên và các cài đặt của mình: hãy khôi phục cài đặt gốc cho thiết bị trước khi trao nó cho người khác.',
    ]);
    expect(alert.mock.calls[0][2]!.map((button) => button.text)).toEqual(['Huỷ', 'Xoá']);
  });

  test('a device removed meanwhile is no failure', async () => {
    const at = await household();
    const bi = await at.add('Bi');
    const alert = dialogs();
    await look(at, 'linh', bi.id);
    await at.api.removeDevice(at.home.id, bi.id);
    await fireEvent.press(screen.getByRole('button', { name: REMOVE }));
    press(alert, 'destructive');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a removal that the role no longer allows is said so', async () => {
    const at = await household();
    const bi = await at.add('Bi');
    const alert = dialogs();
    await look(at, 'an', bi.id);
    const an = await at.member('An');
    await at.api.updateMember(at.home.id, an.id, { role: 'member' }, an.etag);
    await fireEvent.press(screen.getByRole('button', { name: REMOVE }));
    press(alert, 'destructive');
    expect(
      await screen.findByText('Your role in this home does not allow this.'),
    ).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
    expect(await at.names()).toEqual(['Bi']);
  });
});

test('leaving the home forgets its devices too', async () => {
  const at = await household();
  await at.add('Bi');
  const alert = dialogs();
  const queries = newQueryClient(runtimeSettings().queries);
  // Every query of the home's: its key names the home.
  const ofHome = () =>
    queries
      .getQueryCache()
      .findAll()
      .filter((query) => query.queryKey.includes(at.home.id));
  await lookAtHome(at, 'minh', { queries });
  expect(await screen.findByText('Bi')).toBeOnTheScreen();
  expect(ofHome().map((query) => query.queryKey)).toContainEqual(
    expect.arrayContaining(['devices']),
  );
  await screen.unmount();
  await renderScreen(
    <Account transport={at.cloud} secrets={at.sessions.minh} queries={queries}>
      <PersonScreen homeId={at.home.id} memberId={(await at.member('Minh')).id} />
    </Account>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Leave the home' }));
  press(alert, 'destructive');
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
  expect(ofHome()).toEqual([]);
});

// SPDX-License-Identifier: MIT
// Adding a device, as the flow runs it (ADR-0013 of ai-platform; set-up 2.2, How the app runs it):
// with simulated devices in set-up, over the simulated radio, and the simulated cloud.
import { base64url, cryptoRandom } from '@/src/shared/bytes';
import { Refused, Unavailable, type CloudClient } from '@/src/shared/cloud';
import { ProtocolError } from '@/src/shared/protocols';
import { greet, NoRadio, type Link, type Radio, type SimulatedDevice } from '@/src/setup';

import { signedIn } from '../account/render';
import { HOME, listed, qrOf, rest, scan, SETTINGS, works, world, type WorldOptions } from './world';

jest.setTimeout(30_000);

/** A device's key as its registration's `jwk`. */
function jwkOf(device: SimulatedDevice) {
  const point = device.publicKey;
  return {
    crv: 'P-256',
    kty: 'EC',
    x: base64url(point.subarray(1, 33)),
    y: base64url(point.subarray(33)),
  };
}

const HELLO = { kind: 'robot', model: 'simulated', software: '0.0.0' };

/** A radio that hears `devices` whether they advertise or not, as when another phone is in a
 * session with one; and that keeps each link it makes. */
function eavesdropper(devices: SimulatedDevice[]) {
  const links: Link[] = [];
  const radio: Radio = {
    state: async () => 'ready',
    allow: async () => 'ready',
    scan: async () =>
      devices.map((device) => ({
        id: device.id,
        connect: async () => {
          const link = device.connect();
          links.push(link);
          return link;
        },
      })),
  };
  return { radio, links };
}

/** A point where a fake radio waits: `reaching` settles once it is reached, and it goes on at
 * `open`. */
function gate() {
  let reached: () => void = () => undefined;
  let open: () => void = () => undefined;
  const reaching = new Promise<void>((resolve) => {
    reached = resolve;
  });
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { reaching, opened, reached: () => reached(), open: () => open() };
}

/** `link`, which runs `closing` first when it is closed. */
function closingWith(link: Link, closing: () => Promise<void> | void): Link {
  const close = link.close.bind(link);
  link.close = async () => {
    await closing();
    return close();
  };
  return link;
}

/** The radio connection `link` ends on both sides, as when the device goes out of range. */
function drop(link: Link) {
  void link.close();
}

/** `api`, whose registrations reach the cloud, after which the last link ends: `times` times, or
 * always. */
function dropAfterRegistering(api: CloudClient, links: Link[], times = Infinity): CloudClient {
  const dropping = Object.create(api) as CloudClient;
  let left = times;
  dropping.registerDevice = async (homeId, registration) => {
    const registered = await api.registerDevice(homeId, registration);
    if (left > 0) {
      left -= 1;
      drop(links[links.length - 1]);
    }
    return registered;
  };
  return dropping;
}

describe('adding a device', () => {
  test('by its QR code: its network, its password, then the home', async () => {
    const { devices, radio, start, api, home } = await world({ radio: { state: 'ask' } });
    const [device] = devices;
    const { flow, steps } = start();
    expect(flow.current()).toEqual({ step: 'intro' });

    const networks = await scan(flow, device);
    expect(radio.asked).toBe(1);
    expect(networks.step).toBe('networks');
    // Those that hide their name are not listed; those that set-up cannot join are.
    const names = networks.step === 'networks' ? networks.networks.map((each) => each.ssid) : [];
    expect(names).toEqual(['Nhà Linh', 'Quán cà phê', 'Văn phòng']);

    await flow.choose(listed(networks, 'Nhà Linh'));
    expect(flow.current()).toMatchObject({ step: 'password', network: { ssid: 'Nhà Linh' } });

    await flow.password(listed(networks, 'Nhà Linh'), 'sai');
    expect(flow.current()).toMatchObject({ step: 'password', fault: 'wrong_password' });

    await flow.password(listed(networks, 'Nhà Linh'), 'mật khẩu nhà');
    const added = flow.current();
    expect(added).toMatchObject({ step: 'added', added: true, device: { name: 'Robot' } });
    expect(works(steps)).toEqual(
      expect.arrayContaining(['finding', 'connecting', 'scanning', 'joining', 'adding']),
    );

    // The device took the home's settings, closed set-up, and reached the cloud.
    expect(device.languages).toEqual(['vi']);
    expect(device.timeZone).toBe('Asia/Ho_Chi_Minh');
    expect(device.open).toBe(false);
    expect(device.bound).toBe(true);
    const { devices: inHome } = await api.devices(home.id);
    expect(inHome).toHaveLength(1);
    expect(inHome[0]).toMatchObject({ id: device.id.toLowerCase(), connected: true });
  });

  test('a QR code that is no set-up string is refused, and the camera reads on', async () => {
    const { start } = await world();
    const { flow } = start();
    await flow.begin();
    expect(flow.scanned('https://example.com')).toBe(false);
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test("a set-up string of another major version asks for the app's update", async () => {
    const { start } = await world();
    const { flow } = start();
    await flow.begin();
    expect(flow.scanned('setup:99:1A2B:12345678')).toBe(true);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'version', retry: false });
  });

  test('a device on a network that reaches the Internet skips the network', async () => {
    const { devices, start } = await world({ devices: [{ joined: 'Quán cà phê' }] });
    const { flow, steps } = start();
    await flow.begin();
    await flow.typed(devices[0].secret.code);
    expect(flow.current()).toMatchObject({ step: 'added', added: true });
    expect(steps.some((step) => step.step === 'networks')).toBe(false);
  });

  test('a device that does not know yet whether it reaches the Internet is asked again', async () => {
    const { devices, start } = await world({
      devices: [{ joined: 'Quán cà phê', internet: null }],
    });
    const { flow, steps } = start();
    const step = await scan(flow, devices[0]);
    // It never knew, within the setting `internet_wait`: the networks are offered.
    expect(step.step).toBe('networks');
    expect(works(steps).filter((work) => work === 'checking')).toHaveLength(
      SETTINGS.internet_wait / SETTINGS.recheck,
    );
  });

  test('a device whose network does not reach the Internet is offered networks at once', async () => {
    const { devices, start } = await world({
      devices: [{ joined: 'Quán cà phê', internet: false }],
    });
    const { flow, steps } = start();
    expect((await scan(flow, devices[0])).step).toBe('networks');
    expect(works(steps)).not.toContain('checking');
  });

  test('an open network is joined without a password', async () => {
    const { devices, start } = await world();
    const { flow, steps } = start();
    const networks = await scan(flow, devices[0]);
    await flow.choose(listed(networks, 'Quán cà phê'));
    expect(flow.current()).toMatchObject({ step: 'added' });
    expect(steps.some((step) => step.step === 'password')).toBe(false);
  });

  test('a network the device saved is joined without its password', async () => {
    const { devices, start } = await world({ devices: [{ joined: 'Nhà Linh', internet: false }] });
    const { flow, steps } = start();
    const networks = await scan(flow, devices[0]);
    expect(listed(networks, 'Nhà Linh').saved).toBe(true);
    await flow.choose(listed(networks, 'Nhà Linh'));
    expect(flow.current()).toMatchObject({ step: 'added' });
    expect(steps.some((step) => step.step === 'password')).toBe(false);
  });

  test('a network set-up cannot join goes back to the list, saying so', async () => {
    const { devices, start } = await world();
    const { flow } = start();
    const networks = await scan(flow, devices[0]);
    await flow.password(listed(networks, 'Văn phòng'), 'mật khẩu');
    expect(flow.current()).toMatchObject({ step: 'networks', fault: 'network' });
  });

  test('a network out of reach goes back to the list, saying so', async () => {
    const { devices, start } = await world();
    const { flow } = start();
    await scan(flow, devices[0]);
    await flow.choose({ ssid: 'Xa quá', security: 'open', signal: 1, saved: false });
    expect(flow.current()).toMatchObject({ step: 'networks', fault: 'not_found' });
    flow.toNetworks();
    expect(flow.current()).toMatchObject({ step: 'networks' });
    expect(flow.current()).not.toHaveProperty('fault', 'not_found');
  });

  test('a network that hides its name: its name, its security and its password', async () => {
    const { devices, start } = await world();
    const { flow } = start();
    await scan(flow, devices[0]);
    flow.other();
    expect(flow.current()).toEqual({ step: 'hidden' });

    await flow.hidden({ ssid: 'ẩn', security: 'wpa3' }, 'bí mật');
    // Names are case-sensitive: none is called so.
    expect(flow.current()).toEqual({
      step: 'hidden',
      fault: 'not_found',
      last: { ssid: 'ẩn', security: 'wpa3' },
    });

    await flow.hidden({ ssid: 'Ẩn', security: 'wpa3' }, 'sai');
    expect(flow.current()).toMatchObject({ step: 'hidden', fault: 'wrong_password' });

    await flow.hidden({ ssid: 'Ẩn', security: 'wpa3' }, 'bí mật');
    expect(flow.current()).toMatchObject({ step: 'added' });
  });

  test('rescanning lists the networks again', async () => {
    const { devices, start } = await world();
    const { flow, steps } = start();
    await scan(flow, devices[0]);
    await flow.rescan();
    expect(flow.current()).toMatchObject({ step: 'networks' });
    expect(works(steps).filter((work) => work === 'scanning')).toHaveLength(2);
  });

  test("a time zone the device does not know: it takes the home's languages alone", async () => {
    const { devices, start } = await world({
      devices: [{ joined: 'Quán cà phê', knowsTimeZone: () => false }],
    });
    const { flow } = start();
    await scan(flow, devices[0]);
    expect(flow.current()).toMatchObject({ step: 'added' });
    expect(devices[0].languages).toEqual(['vi']);
    expect(devices[0].timeZone).toBe('UTC');
  });

  test("a device's name that a home cannot hold is replaced by its kind's", async () => {
    const bell = 'Robot' + String.fromCharCode(7);
    const { devices, start } = await world({
      devices: [{ joined: 'Quán cà phê', device: { name: bell } }],
    });
    const { flow } = start();
    await scan(flow, devices[0]);
    expect(flow.current()).toMatchObject({ step: 'added', device: { name: 'A robot' } });
  });
});

describe('finding the device', () => {
  test('a typed code, with several devices in set-up, asks for the discriminator', async () => {
    const { devices, start } = await world({ devices: [{}, { joined: 'Quán cà phê' }] });
    const [first, second] = devices;
    const before = first.secret;
    const { flow } = start();
    await flow.begin();
    await flow.typed(second.secret.code);
    expect(flow.current()).toEqual({ step: 'discriminator' });

    await flow.discriminator(second.secret.discriminator);
    expect(flow.current()).toMatchObject({ step: 'added' });
    // The code was tried on the device that matched alone: the other kept its own.
    expect(first.secret).toBe(before);
    expect(first.open).toBe(true);
  });

  test('a discriminator that no device shows: the code has changed', async () => {
    const { devices, start } = await world({ devices: [{}, {}] });
    const { flow } = start();
    await flow.begin();
    await flow.typed(devices[0].secret.code);
    const shown = devices.map((device) => device.secret.discriminator);
    await flow.discriminator(['0000', '0001', '0002'].find((each) => !shown.includes(each))!);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'expired', retry: true });
    await flow.retry();
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test('a discriminator before any code goes back to the code', async () => {
    const { start } = await world();
    const { flow } = start();
    await flow.discriminator('1A2B');
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test('a wrong code: the device draws another, and the person is asked for it', async () => {
    const { devices, start } = await world();
    const [device] = devices;
    const before = device.secret;
    const { flow } = start();
    await flow.begin();
    await flow.typed(before.code === '00000000' ? '11111111' : '00000000');
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'code', retry: true });
    expect(device.secret).not.toBe(before);
    await flow.retry();
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test('no device in set-up nearby', async () => {
    const { devices, start } = await world();
    devices[0].closeSetUp();
    const { flow } = start();
    await flow.begin();
    await flow.typed('12345678');
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'none', retry: true });
    // Looking again finds the device once its set-up is open.
    devices[0].openSetUp();
    await flow.retry();
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'code' });
  });

  test('a device in a session with another phone is busy', async () => {
    const { devices, start } = await world();
    const [device] = devices;
    const other = await greet(device.connect(), {
      random: cryptoRandom,
      settings: SETTINGS,
    });
    const { radio } = eavesdropper(devices);
    const { flow } = start({ radio });
    await flow.begin();
    await flow.typed(device.secret.code);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'busy', retry: true });

    // Once the other phone has gone, trying again finds it.
    await other.close();
    await flow.retry();
    expect(flow.current()).toMatchObject({ step: 'networks' });
  });

  test('a device that goes away before its hello is not one', async () => {
    const { devices, start } = await world();
    const radio: Radio = {
      state: async () => 'ready',
      allow: async () => 'ready',
      scan: async () => [
        {
          id: devices[0].id,
          connect: async () => {
            throw new Error('gone');
          },
        },
      ],
    };
    const { flow } = start({ radio });
    await flow.begin();
    await flow.typed(devices[0].secret.code);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'none' });
  });

  test("a device of a newer set-up is passed over for the code's own", async () => {
    const { devices, start } = await world({ devices: [{ protocol: '9.0' }, {}] });
    const { flow } = start();
    await flow.begin();
    expect(await scan(flow, devices[1])).toMatchObject({ step: 'networks' });
  });

  test("a device of a newer set-up, and no other: the app's update is asked for", async () => {
    const { devices, start } = await world({ devices: [{ protocol: '9.0' }] });
    const { flow } = start();
    await flow.begin();
    await flow.typed(devices[0].secret.code);
    expect(flow.current()).toEqual({ step: 'failed', failure: 'version', retry: false });
  });

  test('busy, beside a device of a newer set-up: busy, which passes', async () => {
    const { devices, start } = await world({ devices: [{ protocol: '9.0' }, {}] });
    const other = await greet(devices[1].connect(), { random: cryptoRandom, settings: SETTINGS });
    const { radio } = eavesdropper(devices);
    const { flow } = start({ radio });
    await flow.begin();
    expect(await scan(flow, devices[1])).toMatchObject({ step: 'failed', failure: 'busy' });
    await other.close();
    await flow.retry();
    expect(flow.current()).toMatchObject({ step: 'networks' });
  });

  test('scans for as long as the settings say', async () => {
    const { devices, start, radio } = await world();
    const scanning = jest.spyOn(radio, 'scan');
    const { flow } = start();
    await flow.begin();
    await flow.typed(devices[0].secret.code);
    expect(scanning).toHaveBeenCalledWith(SETTINGS.scan_time);
  });
});

describe('Bluetooth', () => {
  test('asked for once, after the explanation', async () => {
    const { start, radio } = await world({ radio: { state: 'ask' } });
    const { flow } = start();
    expect(radio.asked).toBe(0);
    await flow.begin();
    expect(radio.asked).toBe(1);
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test('refused: said so, and read again when the person comes back', async () => {
    const { start, radio } = await world({ radio: { state: 'ask', answer: 'blocked' } });
    const { flow } = start();
    await flow.begin();
    expect(flow.current()).toEqual({ step: 'radio', state: 'blocked' });
    await flow.recheck();
    expect(flow.current()).toEqual({ step: 'radio', state: 'blocked' });
    radio.current = 'ready';
    await flow.recheck();
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test('off, then turned on', async () => {
    const { start, radio } = await world({ radio: { state: 'off' } });
    const { flow } = start();
    await flow.begin();
    expect(flow.current()).toEqual({ step: 'radio', state: 'off' });
    radio.current = 'ask';
    await flow.recheck();
    // Not asked yet: the flow waits for a state it can act on.
    expect(flow.current()).toEqual({ step: 'radio', state: 'off' });
    radio.current = 'ready';
    await flow.recheck();
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test('turned off after the explanation: said so, and the code tried once it is on', async () => {
    const { devices, start, radio } = await world();
    const { flow } = start();
    await flow.begin();
    radio.current = 'off';
    await flow.typed(devices[0].secret.code);
    expect(flow.current()).toEqual({ step: 'radio', state: 'off' });
    radio.current = 'ready';
    await flow.recheck();
    expect(flow.current()).toMatchObject({ step: 'networks' });
  });

  test('turned off during the scan: said so, rather than that no device is near', async () => {
    const { devices, start, radio } = await world();
    const { flow } = start();
    await flow.begin();
    jest.spyOn(radio, 'scan').mockImplementationOnce(async () => {
      radio.current = 'off';
      return [];
    });
    await flow.typed(devices[0].secret.code);
    expect(flow.current()).toEqual({ step: 'radio', state: 'off' });
    radio.current = 'ready';
    await flow.recheck();
    expect(flow.current()).toMatchObject({ step: 'networks' });
  });

  test.each(['scanned', 'typed'] as const)(
    'turned off while the device connects, its code %s: said so, and the code tried once it is on',
    async (how) => {
      const { devices, start, radio } = await world();
      const { flow } = start();
      await flow.begin();
      const [device] = devices;
      // The phone fails to connect, as Bluetooth goes off.
      jest.spyOn(radio, 'scan').mockImplementationOnce(async () => [
        {
          id: device.id,
          connect: async () => {
            radio.current = 'off';
            throw new Error('the radio failed to connect');
          },
        },
      ]);
      if (how === 'scanned') {
        expect(flow.scanned(qrOf(device))).toBe(true);
        await rest(flow);
      } else {
        await flow.typed(device.secret.code);
      }
      // Not a code that expired, nor a device away.
      expect(flow.current()).toEqual({ step: 'radio', state: 'off' });
      radio.current = 'ready';
      await flow.recheck();
      expect(flow.current()).toMatchObject({ step: 'networks' });
    },
  );

  test('withdrawn after the explanation: asked for again', async () => {
    const { devices, start, radio } = await world({ radio: { state: 'ask' } });
    const { flow } = start();
    await flow.begin();
    radio.current = 'ask';
    await flow.typed(devices[0].secret.code);
    expect(radio.asked).toBe(2);
    expect(flow.current()).toMatchObject({ step: 'networks' });
  });

  test('none in an app without Bluetooth', async () => {
    const { start } = await world();
    const { flow } = start({ radio: new NoRadio() });
    await flow.begin();
    expect(flow.current()).toEqual({ step: 'radio', state: 'unsupported' });
  });

  test('a radio that says to ask once asked is blocked', async () => {
    const { start } = await world();
    const radio: Radio = {
      state: async () => 'ask',
      allow: async () => 'ask',
      scan: async () => [],
    };
    const { flow } = start({ radio });
    await flow.begin();
    expect(flow.current()).toEqual({ step: 'radio', state: 'blocked' });
  });
});

describe('a device in a home', () => {
  /** Linh's device, added to her home, then in set-up again, as its owner opens it on it. */
  async function addedDevice(options: WorldOptions = {}) {
    const made = await world({ ...options, devices: [{ joined: 'Quán cà phê' }] });
    const { flow } = made.start();
    await scan(flow, made.devices[0]);
    expect(flow.current()).toMatchObject({ step: 'added' });
    made.devices[0].openSetUp();
    return made;
  }

  test('one of the home is given another network, and nothing else', async () => {
    const { devices, start, api, home } = await addedDevice();
    const [device] = devices;
    const { server } = device;
    device.timeZone = 'UTC';
    const { flow } = start();
    const networks = await scan(flow, device);
    expect(networks.step).toBe('networks');
    await flow.choose(listed(networks, 'Nhà Linh'));
    await flow.password(listed(networks, 'Nhà Linh'), 'mật khẩu nhà');
    expect(flow.current()).toEqual({
      step: 'moved',
      homeId: home.id,
      deviceId: device.id.toLowerCase(),
      network: expect.objectContaining({ state: 'connected', ssid: 'Nhà Linh' }),
    });
    // Neither configured nor registered again, and set-up is over.
    expect(device.timeZone).toBe('UTC');
    expect(device.server).toBe(server);
    expect(device.open).toBe(false);
    expect((await api.devices(home.id)).devices).toHaveLength(1);
  });

  test("one of the person's other homes is given another network too", async () => {
    const { devices, start, api } = await addedDevice();
    const other = await api.createHome({ ...HOME, name: 'Nhà khác' });
    const { flow } = start({ home: other });
    const networks = await scan(flow, devices[0]);
    await flow.choose(listed(networks, 'Quán cà phê'));
    expect(flow.current()).toMatchObject({ step: 'moved', homeId: expect.any(String) });
    const moved = flow.current();
    expect(moved.step === 'moved' && moved.homeId !== other.id).toBe(true);
  });

  test("one in none of the person's homes is taken", async () => {
    const { devices, start, cloud } = await addedDevice();
    const minh = await signedIn('Minh', cloud);
    const home = await minh.api.createHome({ ...HOME, name: 'Nhà Minh' });
    const { flow } = start({ api: minh.api, home });
    await scan(flow, devices[0]);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'taken', retry: true });
    await flow.retry();
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test("one registered in another's home, not bound yet, is taken by the cloud", async () => {
    const made = await world({ devices: [{ joined: 'Quán cà phê', reach: () => undefined }] });
    const [device] = made.devices;
    // Minh registers it first; it never reaches the cloud, and offers set-up again.
    const minh = await signedIn('Minh', made.cloud);
    const minhs = await minh.api.createHome({ ...HOME, name: 'Nhà Minh' });
    const first = made.start({ api: minh.api, home: minhs });
    await scan(first.flow, device);
    expect(first.flow.current()).toMatchObject({ step: 'added' });
    expect(device.bound).toBe(false);
    device.openSetUp();

    const { flow } = made.start();
    await scan(flow, device);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'taken' });
  });

  test('a home full of devices', async () => {
    const { devices, start } = await world({
      cloud: { devices_per_home: 1 },
      devices: [{ joined: 'Quán cà phê' }, { joined: 'Quán cà phê' }],
    });
    const first = start();
    await scan(first.flow, devices[0]);
    expect(first.flow.current()).toMatchObject({ step: 'added' });
    const { flow } = start();
    await scan(flow, devices[1]);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'full', retry: false });
  });

  test("a member's role does not add devices", async () => {
    const { devices, start, cloud, api, home } = await world({
      devices: [{ joined: 'Quán cà phê' }],
    });
    const minh = await signedIn('Minh', cloud);
    const { code } = await api.createInvitation(home.id);
    const { home: joined } = await minh.api.acceptInvitation(code);
    expect(joined.role).toBe('member');
    const { flow } = start({ api: minh.api, home: joined });
    await scan(flow, devices[0]);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'not_allowed', retry: false });
  });

  test('bound meanwhile, in no home of the person: taken', async () => {
    const { devices, start, api } = await world({ devices: [{ joined: 'Quán cà phê' }] });
    const [device] = devices;
    const binding = Object.create(api) as CloudClient;
    binding.createDeviceChallenge = async (homeId) => {
      const challenge = await api.createDeviceChallenge(homeId);
      device.bound = true;
      return challenge;
    };
    const { flow } = start({ api: binding });
    await scan(flow, device);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'taken' });
  });
});

describe('when something goes wrong', () => {
  test('the cloud cannot serve: trying again registers', async () => {
    const { devices, start, api } = await world({ devices: [{}] });
    const failing = Object.create(api) as CloudClient;
    let failures = 1;
    failing.createDeviceChallenge = async (homeId) => {
      if (failures > 0) {
        failures -= 1;
        throw new Unavailable('createDeviceChallenge', 503);
      }
      return api.createDeviceChallenge(homeId);
    };
    const { flow } = start({ api: failing });
    // Given its network in this flow: trying again registers, and offers no network again.
    await flow.choose(listed(await scan(flow, devices[0]), 'Quán cà phê'));
    const failed = flow.current();
    expect(failed).toMatchObject({ step: 'failed', failure: 'cloud', retry: true });
    expect(failed.step === 'failed' && failed.error).toBeInstanceOf(Unavailable);
    await flow.retry();
    expect(flow.current()).toMatchObject({ step: 'added', added: true });
  });

  test("an answer of the cloud's that breaks the app API: the cloud's failure", async () => {
    const { devices, start, api } = await world({ devices: [{ joined: 'Quán cà phê' }] });
    const odd = Object.create(api) as CloudClient;
    let left = 1;
    odd.createDeviceChallenge = async (homeId) => {
      if (left > 0) {
        left -= 1;
        throw new ProtocolError('device_challenge', '/challenge', 'is not a string');
      }
      return api.createDeviceChallenge(homeId);
    };
    const { flow } = start({ api: odd });
    const failed = await scan(flow, devices[0]);
    expect(failed).toMatchObject({ step: 'failed', failure: 'cloud', retry: true });
    expect(failed.step === 'failed' && failed.error).toBeInstanceOf(ProtocolError);
    // The device's session stays, and trying again asks the cloud again.
    expect(devices[0].advertising).toBe(false);
    await flow.retry();
    expect(flow.current()).toMatchObject({ step: 'added', added: true });
  });

  test('the cloud cannot list the homes: trying again asks again', async () => {
    const { devices, start, api } = await world({ devices: [{ joined: 'Quán cà phê' }] });
    await scan(start().flow, devices[0]);
    devices[0].openSetUp();
    const failing = Object.create(api) as CloudClient;
    let failures = 1;
    failing.homes = async (page) => {
      if (failures > 0) {
        failures -= 1;
        throw new Refused('homes', 429, 'about:blank');
      }
      return api.homes(page);
    };
    const { flow } = start({ api: failing });
    await scan(flow, devices[0]);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'cloud' });
    await flow.retry();
    expect(flow.current()).toMatchObject({ step: 'networks' });
  });

  test('an interruption: the device is looked for in the home, then its new code', async () => {
    const { devices, start } = await world();
    const { radio, links } = eavesdropper(devices);
    const { flow } = start({ radio });
    const networks = await scan(flow, devices[0]);
    drop(links[0]);
    await flow.choose(listed(networks, 'Quán cà phê'));
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'interrupted', retry: true });
    await flow.retry();
    // Not in the home: its code, which it has drawn again.
    expect(flow.current()).toEqual({ step: 'code' });
  });

  test('interrupted once registered: a new session takes it up, and it is added', async () => {
    const { devices, start, api, home } = await world({ devices: [{ joined: 'Quán cà phê' }] });
    const [device] = devices;
    const { radio, links } = eavesdropper(devices);
    const { flow } = start({ radio, api: dropAfterRegistering(api, links, 1) });
    await scan(flow, device);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'interrupted' });
    // In the home, but not online: its new code.
    await flow.retry();
    expect(flow.current()).toEqual({ step: 'code' });
    expect(device.bound).toBe(false);

    expect(flow.scanned(qrOf(device))).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(await rest(flow)).toMatchObject({ step: 'added', added: true });
    expect(device.bound).toBe(true);
    expect((await api.devices(home.id)).devices).toHaveLength(1);
  });

  test('interrupted once registered, the device online since: on to its name', async () => {
    const { devices, start, api, cloud } = await world({ devices: [{ joined: 'Quán cà phê' }] });
    const [device] = devices;
    const { radio, links } = eavesdropper(devices);
    const { flow } = start({ radio, api: dropAfterRegistering(api, links) });
    await scan(flow, device);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'interrupted' });
    // It reached the cloud all the same, as a robot does once it holds its registration.
    expect(cloud.connectDevice(jwkOf(device), HELLO)).toBe(true);
    await flow.retry();
    expect(flow.current()).toMatchObject({
      step: 'added',
      added: true,
      device: { id: device.id.toLowerCase(), connected: true },
    });
  });

  test('a device that sends what set-up does not allow ends the session', async () => {
    const { devices, start, api } = await world({ devices: [{ joined: 'Quán cà phê' }] });
    const odd = Object.create(api) as CloudClient;
    odd.createDeviceChallenge = async (homeId) => ({
      ...(await api.createDeviceChallenge(homeId)),
      server: 'ftp://nowhere',
    });
    const { flow } = start({ api: odd });
    await scan(flow, devices[0]);
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'broken', retry: true });
    expect(devices[0].advertising).toBe(true);
  });

  test('closing ends the session, and the device stays in set-up', async () => {
    const { devices, start } = await world();
    const { flow, steps } = start();
    await scan(flow, devices[0]);
    expect(devices[0].advertising).toBe(false);
    await flow.close();
    expect(devices[0].advertising).toBe(true);
    const seen = steps.length;
    flow.toCode();
    expect(steps).toHaveLength(seen);
  });

  test('closing while it looks for the device stops it there', async () => {
    const { devices, start } = await world();
    const { flow } = start();
    await flow.begin();
    const typing = flow.typed(devices[0].secret.code);
    await flow.close();
    await typing;
    expect(devices[0].advertising).toBe(true);
  });

  test('closing while it connects lets go of the link it makes', async () => {
    const { devices, start } = await world();
    const [device] = devices;
    const connecting = gate();
    const made = { link: false, closed: false };
    const radio: Radio = {
      state: async () => 'ready',
      allow: async () => 'ready',
      scan: async () => [
        {
          id: device.id,
          connect: async () => {
            connecting.reached();
            await connecting.opened;
            made.link = true;
            return closingWith(device.connect(), () => {
              made.closed = true;
            });
          },
        },
      ],
    };
    const { flow } = start({ radio });
    await flow.begin();
    const typing = flow.typed(device.secret.code);
    await connecting.reaching;
    await flow.close();
    connecting.open();
    await typing;
    expect(made).toEqual({ link: true, closed: true });
  });

  test("closing while it reads Bluetooth's state after an empty scan stops it there", async () => {
    const { devices, start } = await world();
    const reading = gate();
    const radio: Radio = {
      state: async () => {
        reading.reached();
        await reading.opened;
        return 'off';
      },
      allow: async () => 'ready',
      scan: async () => [],
    };
    const { flow } = start({ radio });
    await flow.begin();
    const typing = flow.typed(devices[0].secret.code);
    await reading.reaching;
    await flow.close();
    reading.open();
    await typing;
    expect(flow.current()).toEqual({ step: 'working', work: 'finding' });
  });

  test("closing while a device not the code's is let go connects to no other", async () => {
    const { devices, start } = await world({ devices: [{}, {}] });
    const [first, second] = devices;
    const letting = gate();
    let reached = false;
    const radio: Radio = {
      state: async () => 'ready',
      allow: async () => 'ready',
      scan: async () => [
        {
          id: first.id,
          connect: async () =>
            closingWith(first.connect(), async () => {
              letting.reached();
              await letting.opened;
            }),
        },
        {
          id: second.id,
          connect: async () => {
            reached = true;
            return second.connect();
          },
        },
      ],
    };
    const { flow } = start({ radio });
    await flow.begin();
    await flow.typed(first.secret.code);
    const shown = devices.map((device) => device.secret.discriminator);
    const finding = flow.discriminator(
      ['0000', '0001', '0002'].find((each) => !shown.includes(each))!,
    );
    await letting.reaching;
    await flow.close();
    letting.open();
    await finding;
    expect(reached).toBe(false);
    expect(second.advertising).toBe(true);
  });

  test('trying again with nothing to try does nothing', async () => {
    const { start } = await world();
    const { flow } = start();
    await flow.retry();
    expect(flow.current()).toEqual({ step: 'intro' });
  });
});

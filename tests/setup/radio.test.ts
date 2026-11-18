// SPDX-License-Identifier: MIT
// The radio that finds devices in set-up: simulated, with devices in memory; none, in an app that
// has no Bluetooth; and the one the configuration names.
import { FetchTransport, SimulatedCloud } from '@/src/shared/cloud';
import { runtimeSettings, type SetupSettings } from '@/src/shared/config';
import { greet, NoRadio, radioFor, SimulatedDevice, SimulatedRadio } from '@/src/setup';
import { cryptoRandom } from '@/src/shared/bytes';

import { scan, SETTINGS, world } from './world';

jest.setTimeout(30_000);

const CAFE = { ssid: 'Quán cà phê', security: 'open', signal: 45 } as const;

describe('the simulated radio', () => {
  test('asks once, and takes the answer it was given', async () => {
    const radio = new SimulatedRadio([], { state: 'ask', answer: 'blocked' });
    expect(await radio.state()).toBe('ask');
    expect(await radio.allow()).toBe('blocked');
    expect(await radio.allow()).toBe('blocked');
    expect(radio.asked).toBe(1);
    expect(await new SimulatedRadio([]).allow()).toBe('ready');
  });

  test('hears the devices that advertise, and none while it cannot be used', async () => {
    const open = new SimulatedDevice();
    const closed = new SimulatedDevice({ bound: true });
    const radio = new SimulatedRadio([open, closed]);
    const heard = await radio.scan();
    expect(heard.map((each) => each.id)).toEqual([open.id]);

    // In a session, a device no longer advertises.
    const greeting = await greet(await heard[0].connect(), {
      random: cryptoRandom,
      settings: SETTINGS,
    });
    expect(await radio.scan()).toEqual([]);
    await greeting.close();
    expect(await radio.scan()).toHaveLength(1);

    radio.current = 'off';
    expect(await radio.scan()).toEqual([]);
  });
});

describe('a simulated device in set-up', () => {
  test('opens set-up with a new code, and closes it, telling its screen', async () => {
    const device = new SimulatedDevice({ bound: true });
    const seen: boolean[] = [];
    const stop = device.subscribe(() => seen.push(device.open));
    expect(device.open).toBe(false);
    expect(device.advertising).toBe(false);

    const before = device.secret;
    device.openSetUp();
    expect(device.open).toBe(true);
    expect(device.advertising).toBe(true);
    expect(device.secret).not.toBe(before);

    // Open already: the code stays.
    const shown = device.secret;
    device.openSetUp();
    expect(device.secret).toBe(shown);

    device.closeSetUp();
    expect(device.open).toBe(false);
    stop();
    device.openSetUp();
    expect(seen).toEqual([true, false]);
  });

  test('ends a connection at once while set-up is closed', async () => {
    const device = new SimulatedDevice();
    device.closeSetUp();
    const link = device.connect();
    const closed = new Promise<void>((resolve) =>
      link.listen({ fragment: () => undefined, closed: resolve }),
    );
    await closed;
    await expect(link.write(Uint8Array.of(0))).rejects.toThrow();
  });

  test('shows its own name and identifier, or those it was given', () => {
    const device = new SimulatedDevice({ device: { id: 'E5B4F1A2-0000-4000-8000-000000000001' } });
    expect(device.id).toBe('E5B4F1A2-0000-4000-8000-000000000001');
    expect(device.name).toBe('Robot');
    expect(new SimulatedDevice({ device: { name: 'Bé Na' } }).name).toBe('Bé Na');
  });
});

describe('no radio', () => {
  test('says set-up is not supported, and hears nothing', async () => {
    const radio = new NoRadio();
    expect(await radio.state()).toBe('unsupported');
    expect(await radio.allow()).toBe('unsupported');
    expect(await radio.scan()).toEqual([]);
  });
});

describe('the radio the configuration names', () => {
  const { cloud, setup } = runtimeSettings();
  const simulated: SetupSettings = { ...setup, radio: 'simulated' };

  test("the simulated one, with the configuration's devices", () => {
    const radio = radioFor(
      simulated,
      new SimulatedCloud(cloud.simulated, [cloud.client_id]),
      cloud,
    );
    expect(radio).toBeInstanceOf(SimulatedRadio);
    const { devices } = radio as SimulatedRadio;
    expect(devices).toHaveLength(setup.simulated.devices);
    expect(new Set(devices.map((device) => device.id)).size).toBe(devices.length);
  });

  test('none, for Bluetooth, until the phone has its adapter', () => {
    const transport = new FetchTransport(cloud.address, cloud.timeout, cloud.answer_limit);
    expect(radioFor({ ...setup, radio: 'bluetooth' }, transport, cloud)).toBeInstanceOf(NoRadio);
  });

  test('its devices reach the simulated cloud, once added', async () => {
    const made = await world({ devices: [] });
    const radio = radioFor(
      { ...simulated, simulated: { devices: 1, networks: [CAFE] } },
      made.cloud,
      cloud,
    ) as SimulatedRadio;
    const [device] = radio.devices;
    const { flow } = made.start({ radio });
    const networks = await scan(flow, device);
    expect(networks.step).toBe('networks');
    await flow.choose({ ssid: 'Quán cà phê', security: 'open', signal: 45, saved: false });
    expect(flow.current()).toMatchObject({ step: 'added' });
    expect(device.bound).toBe(true);
  });

  test('and no server but its own', async () => {
    const made = await world({ devices: [] });
    const elsewhere = {
      ...cloud,
      simulated: { ...cloud.simulated, server: 'https://other.invalid' },
    };
    const radio = radioFor(
      { ...simulated, simulated: { devices: 1, networks: [CAFE] } },
      made.cloud,
      elsewhere,
    ) as SimulatedRadio;
    const [device] = radio.devices;
    const { flow } = made.start({ radio });
    await scan(flow, device);
    await flow.choose({ ssid: 'Quán cà phê', security: 'open', signal: 45, saved: false });
    expect(flow.current()).toMatchObject({ step: 'added' });
    expect(device.bound).toBe(false);
  });
});

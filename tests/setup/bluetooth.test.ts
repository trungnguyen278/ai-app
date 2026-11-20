// SPDX-License-Identifier: MIT
// The Bluetooth radio, over a central whose peripherals are simulated devices: whole sessions run
// through it, as on a phone, and so do its failures.
import type { Central, CentralValue } from '@/src/setup/adapters/bluetooth/central';
import { BluetoothRadio } from '@/src/setup/adapters/bluetooth/radio';
import { ANSWER_UUID, REQUEST_UUID, SERVICE_UUID } from '@/src/setup/domain/protocol';
import type { Link, LinkListener, RadioState, SimulatedDevice } from '@/src/setup';

import { listed, scan, SETTINGS, world } from './world';

jest.setTimeout(30_000);

/** What the central was asked, in order. */
type Call =
  | { op: 'scan'; service: string; seconds: number }
  | { op: 'connect' | 'prepare' | 'disconnect'; id: string }
  | { op: 'indicate'; id: string; service: string; characteristic: string }
  | {
      op: 'write';
      id: string;
      service: string;
      characteristic: string;
      length: number;
      size: number;
    };

/** A step of connecting that a test holds back: it never settles, it rejects, or it takes `SLOW`. */
type Hold = 'hang' | 'fail' | 'slow';

/** How long a slow step takes, in milliseconds. */
const SLOW = 50;

/** A central whose peripherals are simulated devices. It gives UUIDs in upper case, as iOS does. */
class DeviceCentral implements Central {
  current: RadioState = 'ready';
  readonly calls: Call[] = [];
  /** Steps of connecting that do not go through. */
  hold: Partial<Record<'connect' | 'prepare' | 'indicate' | 'write' | 'disconnect', Hold>> = {};
  /** The devices whose writes the central never settles, as react-native-ble-manager does on
   * Android once a device refused one for its authentication. */
  readonly unsettled = new Set<string>();
  private readonly links = new Map<string, Link>();
  private readonly values = new Set<(value: CentralValue) => void>();
  private readonly disconnections = new Set<(id: string) => void>();

  constructor(private readonly devices: readonly SimulatedDevice[]) {}

  /** How many listeners the central holds. */
  get listening(): number {
    return this.values.size + this.disconnections.size;
  }

  async state(): Promise<RadioState> {
    return this.current;
  }

  async allow(): Promise<RadioState> {
    return this.current;
  }

  async scan(service: string, seconds: number): Promise<string[]> {
    this.calls.push({ op: 'scan', service, seconds });
    return this.devices.filter((device) => device.advertising).map((device) => device.id);
  }

  async connect(id: string): Promise<void> {
    this.calls.push({ op: 'connect', id });
    await this.held('connect');
    const device = this.devices.find((each) => each.id === id);
    if (device === undefined) throw new Error('no such device');
    this.links.set(id, device.connect());
  }

  async prepare(id: string): Promise<number> {
    this.calls.push({ op: 'prepare', id });
    await this.held('prepare');
    return this.link(id).fragmentSize;
  }

  async indicate(id: string, service: string, characteristic: string): Promise<void> {
    this.calls.push({ op: 'indicate', id, service, characteristic });
    await this.held('indicate');
    this.link(id).listen({
      fragment: (value) =>
        this.emitValue({
          id,
          service: SERVICE_UUID.toUpperCase(),
          characteristic: ANSWER_UUID.toUpperCase(),
          value,
        }),
      closed: () => this.drop(id),
    });
  }

  async write(
    id: string,
    service: string,
    characteristic: string,
    value: Uint8Array,
    size: number,
  ): Promise<void> {
    this.calls.push({ op: 'write', id, service, characteristic, length: value.length, size });
    await this.held('write');
    if (this.unsettled.has(id)) await new Promise<never>(() => undefined);
    await this.link(id).write(value);
  }

  async disconnect(id: string): Promise<void> {
    this.calls.push({ op: 'disconnect', id });
    await this.held('disconnect');
    await this.links.get(id)?.close();
    this.drop(id);
  }

  onValue(listener: (value: CentralValue) => void): () => void {
    this.values.add(listener);
    return () => this.values.delete(listener);
  }

  onDisconnect(listener: (id: string) => void): () => void {
    this.disconnections.add(listener);
    return () => this.disconnections.delete(listener);
  }

  /** A value from a peripheral, as the phone gives it. */
  emitValue(value: CentralValue): void {
    for (const listener of [...this.values]) listener(value);
  }

  /** The peripheral `id` disconnected: it went out of range, or was turned off. */
  drop(id: string): void {
    for (const listener of [...this.disconnections]) listener(id);
  }

  /** The operations on `id`, in order. */
  ops(id: string): string[] {
    return this.calls.flatMap((call) => ('id' in call && call.id === id ? [call.op] : []));
  }

  private link(id: string): Link {
    const link = this.links.get(id);
    if (link === undefined) throw new Error('not connected');
    return link;
  }

  private async held(step: keyof DeviceCentral['hold']): Promise<void> {
    const hold = this.hold[step];
    if (hold === 'hang') await new Promise<never>(() => undefined);
    if (hold === 'fail') throw new Error(`the radio failed to ${step}`);
    if (hold === 'slow') await new Promise((resolve) => setTimeout(resolve, SLOW));
  }
}

/** The bytes in one write: fewer than some messages hold. */
const SIZE = 64;

/** A world whose devices take `fragmentSize` bytes at once, reached through a central. */
async function bluetooth(
  fragmentSize = SIZE,
  timeout = SETTINGS.connect_timeout,
  writeTimeout = SETTINGS.write_timeout,
) {
  const found = await world({ devices: [{ fragmentSize }] });
  const central = new DeviceCentral(found.devices);
  const radio = new BluetoothRadio(central, {
    connect_timeout: timeout,
    write_timeout: writeTimeout,
  });
  return { ...found, central, radio, device: found.devices[0] };
}

/** A link to `device`, over `radio`. */
async function linkTo(radio: BluetoothRadio, device: SimulatedDevice): Promise<Link> {
  const [nearby] = await radio.scan(SETTINGS.scan_time);
  expect(nearby.id).toBe(device.id);
  return nearby.connect();
}

/** A listener that keeps what it hears. */
function listener() {
  const heard = { fragments: [] as Uint8Array[], closed: 0 };
  const listen: LinkListener = {
    fragment: (value) => heard.fragments.push(value),
    closed: () => {
      heard.closed += 1;
    },
  };
  return { heard, listen };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('the Bluetooth radio', () => {
  test('adds a device: its indications on before the first write, each write within the MTU', async () => {
    const { central, radio, device, start } = await bluetooth();
    const { flow } = start({ radio });
    const networks = await scan(flow, device);
    expect(networks.step).toBe('networks');
    await flow.choose(listed(networks, 'Nhà Linh'));
    await flow.password(listed(networks, 'Nhà Linh'), 'mật khẩu nhà');
    expect(flow.current()).toMatchObject({ step: 'added', added: true });

    expect(central.calls[0]).toEqual({
      op: 'scan',
      service: SERVICE_UUID,
      seconds: SETTINGS.scan_time,
    });
    const ops = central.ops(device.id);
    expect(ops.slice(0, 4)).toEqual(['connect', 'prepare', 'indicate', 'write']);
    expect(central.calls).toContainEqual({
      op: 'indicate',
      id: device.id,
      service: SERVICE_UUID,
      characteristic: ANSWER_UUID,
    });
    const writes = central.calls.flatMap((call) => (call.op === 'write' ? [call] : []));
    // The messages took more than one fragment, each a write of its own.
    expect(writes.some((write) => write.length === SIZE)).toBe(true);
    for (const write of writes) {
      expect(write).toMatchObject({
        service: SERVICE_UUID,
        characteristic: REQUEST_UUID,
        size: SIZE,
      });
      expect(write.length).toBeLessThanOrEqual(SIZE);
    }
    // Nothing listens once the session is over.
    expect(central.listening).toBe(0);
  });

  test('a device that never confirms a write is let go, and the code tried on the next', async () => {
    const found = await world({ devices: [{}, {}] });
    const [stuck, own] = found.devices;
    const central = new DeviceCentral(found.devices);
    central.unsettled.add(stuck.id);
    const radio = new BluetoothRadio(central, { connect_timeout: 1, write_timeout: 0.05 });
    const { flow } = found.start({ radio });
    expect((await scan(flow, own)).step).toBe('networks');
    // Its hello was written, and never confirmed: the link ended.
    expect(central.ops(stuck.id)).toEqual([
      'connect',
      'prepare',
      'indicate',
      'write',
      'disconnect',
    ]);
    await flow.close();
  });

  test('a device that goes away in a session interrupts it', async () => {
    const { central, radio, device, start } = await bluetooth();
    const { flow } = start({ radio });
    const networks = await scan(flow, device);
    central.drop(device.id);
    await flow.choose(listed(networks, 'Quán cà phê'));
    expect(flow.current()).toMatchObject({ step: 'failed', failure: 'interrupted', retry: true });
    expect(central.listening).toBe(0);
  });

  test('hears nothing while Bluetooth may not be used, and does not scan', async () => {
    const { central, radio } = await bluetooth();
    for (const state of ['off', 'ask', 'blocked', 'unsupported'] as const) {
      central.current = state;
      expect(await radio.scan(SETTINGS.scan_time)).toEqual([]);
    }
    expect(central.calls).toEqual([]);
  });

  test('tells the central’s state, and its answer', async () => {
    const { central, radio } = await bluetooth();
    central.current = 'ask';
    expect(await radio.state()).toBe('ask');
    jest.spyOn(central, 'allow').mockResolvedValueOnce('blocked');
    expect(await radio.allow()).toBe('blocked');
  });

  describe('connecting', () => {
    test.each(['connect', 'prepare', 'indicate'] as const)(
      'a device whose %s does not settle in time is let go',
      async (step) => {
        const { central, radio, device } = await bluetooth(SIZE, 0.02);
        central.hold[step] = 'hang';
        await expect(linkTo(radio, device)).rejects.toThrow('the device did not connect in time');
        expect(central.ops(device.id).at(-1)).toBe('disconnect');
        expect(central.listening).toBe(0);
      },
    );

    test.each(['connect', 'prepare', 'indicate'] as const)(
      'a device whose %s fails is let go',
      async (step) => {
        const { central, radio, device } = await bluetooth();
        central.hold[step] = 'fail';
        await expect(linkTo(radio, device)).rejects.toThrow(`the radio failed to ${step}`);
        expect(central.ops(device.id).at(-1)).toBe('disconnect');
        expect(central.listening).toBe(0);
      },
    );

    test('a device that takes its time, within `connect_timeout` in seconds, is kept', async () => {
      const { central, radio, device } = await bluetooth(SIZE, 1);
      central.hold = { connect: 'slow', prepare: 'slow', indicate: 'slow' };
      const timers = jest.spyOn(globalThis, 'setTimeout');
      const cleared = jest.spyOn(globalThis, 'clearTimeout');
      const link = await linkTo(radio, device);
      expect(central.ops(device.id)).toEqual(['connect', 'prepare', 'indicate']);
      // Connected, it no longer waits for the time to run out.
      const timer = timers.mock.calls.findIndex(([, ms]) => ms === 1000);
      expect(cleared).toHaveBeenCalledWith(timers.mock.results[timer].value);
      timers.mockRestore();
      cleared.mockRestore();
      await link.close();
    });

    test('a device that fails, then fails to disconnect, is let go all the same', async () => {
      const { central, radio, device } = await bluetooth();
      central.hold = { indicate: 'fail', disconnect: 'fail' };
      await expect(linkTo(radio, device)).rejects.toThrow('the radio failed to indicate');
      expect(central.ops(device.id).at(-1)).toBe('disconnect');
      expect(central.listening).toBe(0);
    });

    test('a device that disconnects while its indications turn on is let go at once', async () => {
      const { central, radio, device } = await bluetooth();
      central.hold.indicate = 'hang';
      const linking = linkTo(radio, device);
      // The indications are being turned on: the link listens.
      while (!central.ops(device.id).includes('indicate')) await tick();
      central.drop(device.id);
      await expect(linking).rejects.toThrow('the link has ended');
      expect(central.listening).toBe(0);
    });

    test('takes the size of its writes from the central', async () => {
      const { radio, device } = await bluetooth(244);
      const link = await linkTo(radio, device);
      expect(link.fragmentSize).toBe(244);
      await link.close();
    });
  });

  describe('a link', () => {
    test('hears the values of its own device’s Answer only, whatever their case', async () => {
      const { central, radio, device } = await bluetooth();
      const link = await linkTo(radio, device);
      const { heard, listen } = listener();
      link.listen(listen);
      const value = Uint8Array.of(1, 2, 3);
      const answer = { id: device.id, service: SERVICE_UUID, characteristic: ANSWER_UUID, value };
      central.emitValue({ ...answer, id: 'another' });
      central.emitValue({ ...answer, service: '0000180f-0000-1000-8000-00805f9b34fb' });
      central.emitValue({ ...answer, characteristic: REQUEST_UUID });
      expect(heard.fragments).toEqual([]);
      central.emitValue(answer);
      central.emitValue({
        ...answer,
        service: SERVICE_UUID.toUpperCase(),
        characteristic: ANSWER_UUID.toUpperCase(),
      });
      expect(heard.fragments).toEqual([value, value]);
      await link.close();
    });

    test('ends when its device disconnects: a write waiting rejects, and so do later ones', async () => {
      const { central, radio, device } = await bluetooth();
      const link = await linkTo(radio, device);
      const { heard, listen } = listener();
      const other = listener();
      link.listen(listen);
      const unlisten = link.listen(other.listen);
      unlisten();
      central.hold.write = 'hang';
      const writing = link.write(Uint8Array.of(1));
      central.drop('another');
      await tick();
      expect(heard.closed).toBe(0);

      central.drop(device.id);
      await expect(writing).rejects.toThrow('the link has ended');
      await tick();
      expect(heard.closed).toBe(1);
      expect(other.heard.closed).toBe(0);
      central.drop(device.id);
      await tick();
      expect(heard.closed).toBe(1);
      await expect(link.write(Uint8Array.of(1))).rejects.toThrow('the link has ended');
      // The central was asked for the first write only.
      expect(central.ops(device.id).filter((op) => op === 'write')).toHaveLength(1);
      expect(central.listening).toBe(0);

      // One that listens once it has ended hears so at once.
      const late = listener();
      link.listen(late.listen);
      expect(late.heard.closed).toBe(1);
      // Its values are another link's now.
      central.emitValue({
        id: device.id,
        service: SERVICE_UUID,
        characteristic: ANSWER_UUID,
        value: Uint8Array.of(9),
      });
      expect(heard.fragments).toEqual([]);
    });

    test('ends when the device does not confirm a write within `write_timeout` in seconds', async () => {
      const { central, radio, device } = await bluetooth(SIZE, SETTINGS.connect_timeout, 0.02);
      const link = await linkTo(radio, device);
      const { heard, listen } = listener();
      link.listen(listen);
      central.hold.write = 'hang';
      await expect(link.write(Uint8Array.of(1))).rejects.toThrow(
        'the device did not confirm a write in time',
      );
      await tick();
      expect(heard.closed).toBe(1);
      // Ending the link lets the central's write go.
      expect(central.ops(device.id).slice(-2)).toEqual(['write', 'disconnect']);
      expect(central.listening).toBe(0);
      await expect(link.write(Uint8Array.of(1))).rejects.toThrow('the link has ended');
    });

    test('keeps a write that the device confirms in time', async () => {
      const { central, radio, device } = await bluetooth(SIZE, SETTINGS.connect_timeout, 1);
      const link = await linkTo(radio, device);
      const { heard, listen } = listener();
      link.listen(listen);
      // A write that takes its time, and that the device does not read.
      central.write = () => new Promise((resolve) => setTimeout(resolve, SLOW));
      const timers = jest.spyOn(globalThis, 'setTimeout');
      const cleared = jest.spyOn(globalThis, 'clearTimeout');
      await link.write(Uint8Array.of(1));
      // Confirmed, it no longer waits for the time to run out.
      const timer = timers.mock.calls.findIndex(([, ms]) => ms === 1000);
      expect(cleared).toHaveBeenCalledWith(timers.mock.results[timer].value);
      timers.mockRestore();
      cleared.mockRestore();
      await tick();
      expect(heard.closed).toBe(0);
      expect(central.ops(device.id)).not.toContain('disconnect');
      await link.close();
    });

    test('closes: it disconnects once, and its listeners hear it after the close', async () => {
      const { central, radio, device } = await bluetooth();
      const link = await linkTo(radio, device);
      const { heard, listen } = listener();
      link.listen(listen);
      const closing = link.close();
      expect(heard.closed).toBe(0);
      await closing;
      await tick();
      expect(heard.closed).toBe(1);
      await link.close();
      expect(central.ops(device.id).filter((op) => op === 'disconnect')).toHaveLength(1);
      await expect(link.write(Uint8Array.of(1))).rejects.toThrow('the link has ended');
      expect(central.ops(device.id)).not.toContain('write');
      expect(central.listening).toBe(0);
    });

    test('closes even when the central fails to disconnect', async () => {
      const { central, radio, device } = await bluetooth();
      const link = await linkTo(radio, device);
      central.disconnect = () => Promise.reject(new Error('the radio failed'));
      await expect(link.close()).resolves.toBeUndefined();
      await expect(link.write(Uint8Array.of(1))).rejects.toThrow('the link has ended');
    });

    test('refuses a fragment longer than one write, which the phone would split', async () => {
      const { central, radio, device } = await bluetooth(20);
      const link = await linkTo(radio, device);
      await expect(link.write(new Uint8Array(21))).rejects.toThrow(RangeError);
      expect(central.ops(device.id)).not.toContain('write');
      await link.write(new Uint8Array(20)).catch(() => undefined);
      expect(central.calls.at(-1)).toMatchObject({ op: 'write', length: 20, size: 20 });
      await link.close();
    });
  });
});

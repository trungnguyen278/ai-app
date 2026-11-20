// SPDX-License-Identifier: MIT
// The phone's central, over a stand-in for react-native-ble-manager: what it asks of the library,
// and what it makes of its answers, on Android and on an iPhone.
import { PermissionsAndroid, Platform, TurboModuleRegistry } from 'react-native';

import { PhoneCentral, phoneCentral, type Manager } from '@/src/setup/adapters/bluetooth/phone';
import { ANSWER_UUID, SERVICE_UUID } from '@/src/setup/domain/protocol';

/** The library's module and the app's own Location module, as a phone's build has them: the
 * library's native module is found only where a test says so. */
const mockLibrary = { manager: {} };
const mockLocation = { isLocationEnabled: jest.fn(async () => true) };
const mockNative = jest.fn((name: string) => {
  if (name !== 'LocationSetting') throw new Error('no such native module');
  return mockLocation;
});
jest.mock('react-native-ble-manager', () => ({
  __esModule: true,
  get default() {
    return mockLibrary.manager;
  },
}));
jest.mock('expo', () => ({ requireNativeModule: (name: string) => mockNative(name) }));

const { BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION } = PermissionsAndroid.PERMISSIONS;

type Handler = (event: never) => void;

/** A stand-in for the library: each method a mock, and its events emitted by the test. */
function library(state = 'on') {
  const handlers: Record<string, Set<Handler>> = {};
  const on = (name: string) =>
    jest.fn((handler: Handler) => {
      (handlers[name] ??= new Set()).add(handler);
      return { remove: jest.fn(() => handlers[name].delete(handler)) };
    });
  const manager = {
    checkState: jest.fn(async () => state),
    start: jest.fn(async () => undefined),
    isStarted: jest.fn(async () => false),
    scan: jest.fn(async () => undefined),
    stopScan: jest.fn(async () => undefined),
    connect: jest.fn(async () => undefined),
    requestMTU: jest.fn(async () => 517),
    retrieveServices: jest.fn(async () => ({})),
    getMaximumWriteValueLengthForWithoutResponse: jest.fn(async () => 182),
    startNotification: jest.fn(async () => undefined),
    write: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    onDiscoverPeripheral: on('discover'),
    onDidUpdateState: on('state'),
    onDisconnectPeripheral: on('disconnect'),
    onDidUpdateValueForCharacteristic: on('value'),
  };
  const emit = (name: string, event: unknown) => {
    for (const handler of [...(handlers[name] ?? [])]) handler(event as never);
  };
  const listening = (name: string) => handlers[name]?.size ?? 0;
  return { manager, emit, listening, central: manager as unknown as Manager };
}

/** Android's permissions: `granted` those it holds, `answer` what the person says to the rest. */
function permissions(granted: string[] = [], answer: string = PermissionsAndroid.RESULTS.GRANTED) {
  return {
    check: jest.fn(async (permission: string) => granted.includes(permission)),
    requestMultiple: jest.fn(async (asked: string[]) =>
      Object.fromEntries(
        asked.map((permission) => [
          permission,
          granted.includes(permission) ? PermissionsAndroid.RESULTS.GRANTED : answer,
        ]),
      ),
    ),
  };
}

/** Android's Location setting, on or off. */
function locationSetting(on = true) {
  return { isLocationEnabled: jest.fn(async () => on) };
}

function android(
  state = 'on',
  api = 36,
  held = permissions([BLUETOOTH_SCAN, BLUETOOTH_CONNECT]),
  location = locationSetting(),
) {
  const lib = library(state);
  const central = new PhoneCentral(lib.central, {
    os: 'android',
    api,
    permissions: held as never,
    location,
  });
  return { ...lib, central, permissions: held, location };
}

function iphone(state = 'on') {
  const lib = library(state);
  const central = new PhoneCentral(lib.central, { os: 'ios' });
  return { ...lib, central };
}

/** The phone the tests run as: its system, its version, and whether the library's native module
 * is in its build. */
function runAs(os: 'android' | 'ios' | 'web', version: number | string, native = true) {
  jest.replaceProperty(Platform, 'OS', os);
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
  jest
    .spyOn(TurboModuleRegistry, 'get')
    .mockImplementation((name) => (native && name === 'BleManager' ? ({} as never) : null));
  const lib = library();
  mockLibrary.manager = lib.manager;
  return lib;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('the phone’s central', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    mockNative.mockClear();
    mockLocation.isLocationEnabled.mockReset().mockResolvedValue(true);
  });

  test('is none without the library’s native module, as in Expo Go and the tests', () => {
    expect(phoneCentral()).toBeNull();
    runAs('android', 36, false);
    expect(phoneCentral()).toBeNull();
    // Nor on the web, whatever it has.
    runAs('web', '');
    expect(phoneCentral()).toBeNull();
  });

  describe('where the library’s native module is', () => {
    test('on Android 12 and later, asks for Bluetooth’s permissions, and never for Location', async () => {
      const { manager } = runAs('android', 31);
      const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
      mockLocation.isLocationEnabled.mockResolvedValue(false);
      expect(await phoneCentral()?.state()).toBe('ready');
      expect(check.mock.calls.flat()).toEqual([BLUETOOTH_SCAN, BLUETOOTH_CONNECT]);
      expect(manager.checkState).toHaveBeenCalled();
      expect(mockNative).toHaveBeenCalledWith('LocationSetting');
      expect(mockLocation.isLocationEnabled).not.toHaveBeenCalled();
    });

    test('on Android 11, asks for the location’s permission, and reads Location', async () => {
      runAs('android', 30);
      const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
      mockLocation.isLocationEnabled.mockResolvedValue(false);
      expect(await phoneCentral()?.state()).toBe('location');
      expect(check.mock.calls.flat()).toEqual([ACCESS_FINE_LOCATION]);
    });

    test('on an iPhone, asks the library, and needs no module of the app’s', async () => {
      const { manager } = runAs('ios', '26.1');
      expect(await phoneCentral()?.state()).toBe('ask');
      expect(manager.isStarted).toHaveBeenCalled();
      expect(mockNative).not.toHaveBeenCalled();
    });
  });

  describe('on Android', () => {
    test.each([
      ['on', 'ready'],
      ['off', 'off'],
      ['turning_on', 'off'],
      ['turning_off', 'off'],
      ['unsupported', 'unsupported'],
    ])('Bluetooth %s, its permissions held: %s', async (state, expected) => {
      const { central } = android(state);
      expect(await central.state()).toBe(expected);
    });

    test('asks for Bluetooth’s permissions from Android 12, and for the location before', async () => {
      const twelve = android('on', 31, permissions([BLUETOOTH_SCAN]));
      expect(await twelve.central.state()).toBe('ask');
      expect(twelve.permissions.check.mock.calls.flat()).toEqual([
        BLUETOOTH_SCAN,
        BLUETOOTH_CONNECT,
      ]);
      const eleven = android('on', 30, permissions([ACCESS_FINE_LOCATION]));
      expect(await eleven.central.state()).toBe('ready');
      expect(eleven.permissions.check.mock.calls.flat()).toEqual([ACCESS_FINE_LOCATION]);
      // Bluetooth's permissions are not the location.
      expect(await android('on', 30).central.state()).toBe('ask');
    });

    test('before Android 12, finds nothing while Location is off, and says so', async () => {
      const off = locationSetting(false);
      const eleven = android('on', 30, permissions([ACCESS_FINE_LOCATION]), off);
      expect(await eleven.central.state()).toBe('location');
      expect(await eleven.central.allow()).toBe('location');
      expect(off.isLocationEnabled).toHaveBeenCalledTimes(2);
      // Bluetooth off is told first, and so is a permission not given.
      const bluetoothOff = android('off', 30, permissions([ACCESS_FINE_LOCATION]), off);
      expect(await bluetoothOff.central.state()).toBe('off');
      expect(await android('on', 30, permissions(), off).central.state()).toBe('ask');
      // With Location on, or from Android 12, a scan finds devices.
      const on = android('on', 30, permissions([ACCESS_FINE_LOCATION]));
      expect(await on.central.allow()).toBe('ready');
      expect(on.location.isLocationEnabled).toHaveBeenCalled();
      const twelve = android('on', 31, undefined, locationSetting(false));
      expect(await twelve.central.state()).toBe('ready');
      expect(twelve.location.isLocationEnabled).not.toHaveBeenCalled();
    });

    test('a phone without Bluetooth LE asks nothing', async () => {
      const { central, permissions: held, manager } = android('unsupported', 36, permissions());
      expect(await central.state()).toBe('unsupported');
      expect(await central.allow()).toBe('unsupported');
      expect(held.check).not.toHaveBeenCalled();
      expect(held.requestMultiple).not.toHaveBeenCalled();
      expect(manager.start).not.toHaveBeenCalled();
    });

    test('allowed, it starts the library, and tells whether Bluetooth is on', async () => {
      const { central, permissions: held, manager } = android('off', 36, permissions());
      expect(await central.allow()).toBe('off');
      expect(held.requestMultiple).toHaveBeenCalledWith([BLUETOOTH_SCAN, BLUETOOTH_CONNECT]);
      expect(manager.start).toHaveBeenCalledWith({ showAlert: false });
    });

    test.each([
      [PermissionsAndroid.RESULTS.DENIED, 'ask'],
      [PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN, 'blocked'],
    ])('refused (%s): %s, and the library is not started', async (answer, expected) => {
      const { central, manager } = android('on', 36, permissions([BLUETOOTH_SCAN], answer));
      expect(await central.allow()).toBe(expected);
      expect(manager.start).not.toHaveBeenCalled();
    });

    test('asks the device for the MTU that the largest fragment needs: its writes are the MTU less 3', async () => {
      const { central, manager } = android();
      expect(await central.prepare('A', SERVICE_UUID)).toBe(514);
      expect(manager.requestMTU).toHaveBeenCalledWith('A', 515);
      expect(manager.retrieveServices).toHaveBeenCalledWith('A', [SERVICE_UUID]);
      expect(manager.getMaximumWriteValueLengthForWithoutResponse).not.toHaveBeenCalled();
      manager.requestMTU.mockResolvedValueOnce(23);
      expect(await central.prepare('A', SERVICE_UUID)).toBe(20);
      manager.requestMTU.mockResolvedValueOnce(185);
      expect(await central.prepare('A', SERVICE_UUID)).toBe(182);
    });
  });

  describe('on an iPhone', () => {
    test('before it starts, the phone has not asked yet: starting asks', async () => {
      const { central, manager } = iphone();
      expect(await central.state()).toBe('ask');
      expect(manager.checkState).not.toHaveBeenCalled();
      expect(manager.start).not.toHaveBeenCalled();
    });

    test.each([
      ['on', 'ready'],
      ['off', 'off'],
      ['unauthorized', 'blocked'],
      ['unsupported', 'unsupported'],
      ['resetting', 'off'],
    ])('once started, Bluetooth %s: %s', async (state, expected) => {
      const { central, manager } = iphone(state);
      manager.isStarted.mockResolvedValue(true);
      expect(await central.state()).toBe(expected);
    });

    test('allowed, it starts without an alert of its own, and waits until it knows', async () => {
      const { central, manager, emit, listening } = iphone('unknown');
      const allowing = central.allow();
      let answer: string | null = null;
      void allowing.then((state) => (answer = state));
      await tick();
      expect(manager.start).toHaveBeenCalledWith({ showAlert: false });
      emit('state', { state: 'resetting' });
      await tick();
      expect(answer).toBeNull();
      emit('state', { state: 'unauthorized' });
      expect(await allowing).toBe('blocked');
      expect(listening('state')).toBe(0);
    });

    test('allowed, a state known at once is the answer', async () => {
      const { central, listening } = iphone('on');
      expect(await central.allow()).toBe('ready');
      expect(listening('state')).toBe(0);
    });

    test('a library that does not start fails the question', async () => {
      const { central, manager, listening } = iphone();
      manager.start.mockRejectedValueOnce(
        new Error('NSBluetoothAlwaysUsageDescription is not set'),
      );
      await expect(central.allow()).rejects.toThrow('not set');
      expect(listening('state')).toBe(0);
    });

    test('takes its writes’ size from the phone, as one without a response', async () => {
      const { central, manager } = iphone();
      expect(await central.prepare('B', SERVICE_UUID)).toBe(182);
      expect(manager.retrieveServices).toHaveBeenCalledWith('B', [SERVICE_UUID]);
      expect(manager.getMaximumWriteValueLengthForWithoutResponse).toHaveBeenCalledWith('B');
      expect(manager.requestMTU).not.toHaveBeenCalled();
      manager.getMaximumWriteValueLengthForWithoutResponse.mockResolvedValueOnce(0);
      expect(await central.prepare('B', SERVICE_UUID)).toBe(20);
    });
  });

  test('scans in the foreground’s mode for the service, each device once, for the time asked', async () => {
    const { central, manager, emit, listening } = android();
    const advertised = (id: string, serviceUUIDs?: string[]) =>
      emit('discover', { id, rssi: -50, advertising: { serviceUUIDs } });
    manager.scan.mockImplementationOnce(async () => {
      advertised('A', [SERVICE_UUID]);
      advertised('B', ['0000180f-0000-1000-8000-00805f9b34fb']);
      advertised('C');
      advertised('A', [SERVICE_UUID]);
      advertised('D', [SERVICE_UUID.toUpperCase()]);
    });
    const started = Date.now();
    expect(await central.scan(SERVICE_UUID, 0.05)).toEqual(['A', 'D']);
    expect(Date.now() - started).toBeGreaterThanOrEqual(45);
    expect(manager.start).toHaveBeenCalledWith({ showAlert: false });
    expect(manager.scan).toHaveBeenCalledWith({ serviceUUIDs: [SERVICE_UUID], scanMode: 2 });
    expect(manager.stopScan).toHaveBeenCalledTimes(1);
    expect(listening('discover')).toBe(0);
  });

  test('a scan that fails stops listening', async () => {
    const { central, manager, listening } = android();
    manager.scan.mockRejectedValueOnce(new Error('the scan failed'));
    await expect(central.scan(SERVICE_UUID, 0.01)).rejects.toThrow('the scan failed');
    expect(listening('discover')).toBe(0);
  });

  test('connects, turns on indications, writes within its size and disconnects', async () => {
    const { central, manager } = iphone();
    await central.connect('A');
    expect(manager.connect).toHaveBeenCalledWith('A');
    await central.indicate('A', SERVICE_UUID, ANSWER_UUID);
    expect(manager.startNotification).toHaveBeenCalledWith('A', SERVICE_UUID, ANSWER_UUID);
    await central.write('A', SERVICE_UUID, ANSWER_UUID, Uint8Array.of(1, 2, 255), 182);
    expect(manager.write).toHaveBeenCalledWith('A', SERVICE_UUID, ANSWER_UUID, [1, 2, 255], 182);
    await central.disconnect('A');
    expect(manager.disconnect).toHaveBeenCalledWith('A');
  });

  test('tells the values and the disconnections, until told to stop', async () => {
    const { central, emit, listening } = android();
    const values: unknown[] = [];
    const gone: string[] = [];
    const offValue = central.onValue((value) => values.push(value));
    const offGone = central.onDisconnect((id) => gone.push(id));
    emit('value', { peripheral: 'A', service: 'S', characteristic: 'C', value: [1, 2] });
    emit('disconnect', { peripheral: 'A', status: 19 });
    expect(values).toEqual([
      { id: 'A', service: 'S', characteristic: 'C', value: Uint8Array.of(1, 2) },
    ]);
    expect(gone).toEqual(['A']);
    offValue();
    offGone();
    expect(listening('value') + listening('disconnect')).toBe(0);
  });
});

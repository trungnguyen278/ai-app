// SPDX-License-Identifier: MIT
// The phone's Bluetooth LE central: react-native-ble-manager's (ADR-0001), whose native module is in
// a development or store build of the app, and not on the web nor in Expo Go.
import { requireNativeModule } from 'expo';
import { PermissionsAndroid, Platform, TurboModuleRegistry, type Permission } from 'react-native';
import type BleManager from 'react-native-ble-manager';
import type { BleScanMode, BleState, Peripheral } from 'react-native-ble-manager';

import { MAX_FRAGMENT, MIN_FRAGMENT } from '../../domain/protocol';
import type { RadioState } from '../../ports/radio';
import type { Central, CentralValue } from './central';

/** The part of react-native-ble-manager that set-up uses. */
export type Manager = Pick<
  typeof BleManager,
  | 'checkState'
  | 'start'
  | 'isStarted'
  | 'scan'
  | 'stopScan'
  | 'connect'
  | 'requestMTU'
  | 'retrieveServices'
  | 'getMaximumWriteValueLengthForWithoutResponse'
  | 'startNotification'
  | 'write'
  | 'disconnect'
  | 'onDiscoverPeripheral'
  | 'onDidUpdateState'
  | 'onDisconnectPeripheral'
  | 'onDidUpdateValueForCharacteristic'
>;

/** Android's Location setting: the app's own module, in modules/location-setting. */
export interface LocationSetting {
  isLocationEnabled(): Promise<boolean>;
}

/** The Android phone the central runs on. */
export interface AndroidSystem {
  readonly os: 'android';
  /** Its API level. */
  readonly api: number;
  /** Its runtime permissions. */
  readonly permissions: Pick<typeof PermissionsAndroid, 'check' | 'requestMultiple'>;
  /** Its Location setting. */
  readonly location: LocationSetting;
}

/** The phone the central runs on. */
export type PhoneSystem = AndroidSystem | { readonly os: 'ios' };

/** Android 12's API level: from it, a scan needs Bluetooth's own permissions, and before it, the
 * location's permission and Location on (developer.android.com, Bluetooth permissions, read
 * 2026-11-21). */
const ANDROID_12 = 31;

/** What a write leaves of the ATT MTU: a fragment is the MTU minus 3 bytes (platform/protocols/
 * setup/README.md, The Bluetooth service). */
const ATT_HEADER = 3;

/** Android's scan mode with the highest duty cycle, which Android recommends only in the
 * foreground (ScanSettings.SCAN_MODE_LOW_LATENCY, developer.android.com, read 2026-11-21): set-up
 * scans for a few seconds, while the person waits. The library's own default is the lowest. */
const LOW_LATENCY = 2 as BleScanMode;

/** No alert of the iPhone's own when Bluetooth is off: set-up says so itself
 * (CBCentralManagerOptionShowPowerAlertKey). */
const START = { showAlert: false };

/** The phone's central, or `null` in an app without the library's native module: the web, Expo
 * Go, the tests. */
export function phoneCentral(): Central | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return null;
  }
  // The library's module finds its native module as the library does, and throws as it loads
  // where there is none: it loads only once that is known.
  if (TurboModuleRegistry.get('BleManager') === null) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { default: manager } = require('react-native-ble-manager') as { default: Manager };
  return new PhoneCentral(
    manager,
    Platform.OS === 'android'
      ? {
          os: 'android',
          api: Platform.Version,
          permissions: PermissionsAndroid,
          location: requireNativeModule<LocationSetting>('LocationSetting'),
        }
      : { os: 'ios' },
  );
}

/** What Android asks the person for, by its API level: from Android 12 (API 31), Bluetooth's own
 * permissions, which the manifest says are never used for the location; before, the location,
 * without which a scan finds nothing (developer.android.com, Bluetooth permissions, read
 * 2026-11-21). */
function androidPermissions(api: number): Permission[] {
  const { BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION } =
    PermissionsAndroid.PERMISSIONS;
  return api >= ANDROID_12 ? [BLUETOOTH_SCAN, BLUETOOTH_CONNECT] : [ACCESS_FINE_LOCATION];
}

/** The radio's state, from the central's. Turning on or off, it is off until it is on. */
function radioState(state: `${BleState}`): RadioState {
  switch (state) {
    case 'on':
      return 'ready';
    case 'unauthorized':
      return 'blocked';
    case 'unsupported':
      return 'unsupported';
    default:
      return 'off';
  }
}

/** The radio's `state` on `system`, once Location is known: before Android 12 the Bluetooth stack
 * drops every result of a scan while Location is off (AOSP, packages/apps/Bluetooth, GattService's
 * hasScanResultPermission, android11-release and pie-release, read 2026-11-21), and the person is
 * told so, as Nordic's scanner tells it (Android-Common-Libraries, scanner-ble, ScanEmptyView). */
async function located(system: AndroidSystem, state: RadioState): Promise<RadioState> {
  if (state !== 'ready' || system.api >= ANDROID_12) return state;
  return (await system.location.isLocationEnabled()) ? 'ready' : 'location';
}

/** Whether `peripheral` advertises `service`: the scan asks the phone for those alone, and the
 * app does not count on each phone's filter. */
function advertises(peripheral: Peripheral, service: string): boolean {
  const wanted = service.toLowerCase();
  return (peripheral.advertising.serviceUUIDs ?? []).some((uuid) => uuid.toLowerCase() === wanted);
}

export class PhoneCentral implements Central {
  constructor(
    private readonly manager: Manager,
    private readonly system: PhoneSystem,
  ) {}

  async state(): Promise<RadioState> {
    const { system } = this;
    if (system.os === 'ios') {
      // An iPhone's central tells its state only once it has started, and starting it asks the
      // person, the first time.
      return (await this.manager.isStarted()) ? radioState(await this.manager.checkState()) : 'ask';
    }
    const state = await this.manager.checkState();
    if (state === 'unsupported') return 'unsupported';
    const granted = await Promise.all(
      androidPermissions(system.api).map((permission) => system.permissions.check(permission)),
    );
    return granted.every(Boolean) ? located(system, radioState(state)) : 'ask';
  }

  async allow(): Promise<RadioState> {
    const { system } = this;
    if (system.os === 'ios') {
      return this.settled();
    }
    if ((await this.manager.checkState()) === 'unsupported') return 'unsupported';
    const answers = Object.values(
      await system.permissions.requestMultiple(androidPermissions(system.api)),
    );
    if (answers.includes(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'blocked';
    if (!answers.every((answer) => answer === PermissionsAndroid.RESULTS.GRANTED)) return 'ask';
    await this.manager.start(START);
    return located(system, radioState(await this.manager.checkState()));
  }

  async scan(service: string, seconds: number): Promise<string[]> {
    await this.manager.start(START);
    const ids: string[] = [];
    const subscription = this.manager.onDiscoverPeripheral((peripheral) => {
      if (!ids.includes(peripheral.id) && advertises(peripheral, service)) ids.push(peripheral.id);
    });
    try {
      await this.manager.scan({ serviceUUIDs: [service], scanMode: LOW_LATENCY });
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      await this.manager.stopScan();
    } finally {
      subscription.remove();
    }
    return ids;
  }

  async connect(id: string): Promise<void> {
    await this.manager.connect(id);
  }

  async prepare(id: string, service: string): Promise<number> {
    let size: number;
    if (this.system.os === 'android') {
      // Android asks for the MTU that the largest fragment needs. From Android 14 it asks for 517,
      // whatever the app wants, and the device answers with its own: the MTU is the smaller one
      // (developer.android.com/about/versions/14/behavior-changes-all, read 2026-11-12).
      const mtu = await this.manager.requestMTU(id, MAX_FRAGMENT + ATT_HEADER);
      await this.manager.retrieveServices(id, [service]);
      size = mtu - ATT_HEADER;
    } else {
      await this.manager.retrieveServices(id, [service]);
      // An iPhone settles the MTU itself. A write without a response carries the ATT MTU minus 3
      // bytes; one with a response may carry more, in a long write that the protocol does not use
      // (Apple, CBCharacteristicWriteType, read 2026-11-21).
      size = await this.manager.getMaximumWriteValueLengthForWithoutResponse(id);
    }
    // Every link carries 20 bytes at least: the smallest MTU, 23, leaves 20 (The Bluetooth service).
    return Math.max(MIN_FRAGMENT, size);
  }

  async indicate(id: string, service: string, characteristic: string): Promise<void> {
    // The library settles once the device confirmed the descriptor's write: Android's in
    // onDescriptorWrite, iOS's in didUpdateNotificationStateFor.
    await this.manager.startNotification(id, service, characteristic);
  }

  async write(
    id: string,
    service: string,
    characteristic: string,
    value: Uint8Array,
    size: number,
  ): Promise<void> {
    // The library splits a value longer than `size` into writes of its own: none is.
    await this.manager.write(id, service, characteristic, Array.from(value), size);
  }

  async disconnect(id: string): Promise<void> {
    await this.manager.disconnect(id);
  }

  onValue(listener: (value: CentralValue) => void): () => void {
    const subscription = this.manager.onDidUpdateValueForCharacteristic((event) =>
      listener({
        id: event.peripheral,
        service: event.service,
        characteristic: event.characteristic,
        value: Uint8Array.from(event.value),
      }),
    );
    return () => subscription.remove();
  }

  onDisconnect(listener: (id: string) => void): () => void {
    const subscription = this.manager.onDisconnectPeripheral((event) => listener(event.peripheral));
    return () => subscription.remove();
  }

  /** Starts the central, which asks the person the first time, and waits until it knows whether
   * Bluetooth is on: an iPhone tells it later, by an event. */
  private async settled(): Promise<RadioState> {
    let subscription: { remove(): void } | undefined;
    try {
      const state = await new Promise<`${BleState}`>((resolve, reject) => {
        const known = (state: `${BleState}`) => {
          if (state !== 'unknown' && state !== 'resetting') resolve(state);
        };
        subscription = this.manager.onDidUpdateState((event) => known(event.state));
        this.manager
          .start(START)
          .then(() => this.manager.checkState())
          .then(known, reject);
      });
      return radioState(state);
    } finally {
      subscription?.remove();
    }
  }
}

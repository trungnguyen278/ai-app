// SPDX-License-Identifier: MIT
import { usePlainText } from '@/src/shared/catalog';
import type { App } from '@/src/shared/protocols';

import { kindOf } from '../domain/kinds';
import { useDevice } from '../services/devices';

/**
 * What a device is called: its name in the home, or, for one that has none yet, the app's name
 * for its kind, so that no list shows an identifier (the app API, Naming a device). That name
 * is the one its owner starts from to rename it, so it is plain, without isolating marks.
 */
export function useDeviceNames(): (device: App.Device) => string {
  const plain = usePlainText();
  return (device) => device.name ?? plain(`devices.kind.${kindOf(device.kind)}`);
}

/** What a device of a home is called, once its devices are read: what its screen is called. */
export function useDeviceName(homeId: string, deviceId: string): string | undefined {
  const device = useDevice(homeId, deviceId);
  const nameOf = useDeviceNames();
  return device === undefined ? undefined : nameOf(device);
}

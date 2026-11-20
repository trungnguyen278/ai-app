// SPDX-License-Identifier: MIT
// The radio that the configuration names ([setup].radio): the phone's, or one simulated in memory,
// whose devices reach the simulated cloud once set-up is over.
import { SimulatedCloud, type CloudSettings, type Transport } from '@/src/shared/cloud';
import type { SetupSettings } from '@/src/shared/config';

import type { Radio } from '../ports/radio';
import { phoneCentral } from './bluetooth/phone';
import { BluetoothRadio } from './bluetooth/radio';
import { SimulatedDevice, type DeviceServer } from './simulated/device';
import { SimulatedRadio } from './simulated/radio';
import { NoRadio } from './unavailable';

/**
 * The simulated radio, with `[setup.simulated]`'s devices in set-up, or the phone's. A simulated
 * device reaches the server its registration names only when that is the simulated cloud that
 * `transport` is. The phone's radio is Bluetooth LE; an app without it, the web's or Expo Go's,
 * says that set-up is not supported.
 */
export function radioFor(
  settings: SetupSettings,
  transport: Transport,
  cloud: CloudSettings,
): Radio {
  if (settings.radio === 'simulated') {
    const reach = (server: string): DeviceServer | undefined =>
      transport instanceof SimulatedCloud && server === cloud.simulated.server
        ? transport
        : undefined;
    const devices = Array.from(
      { length: settings.simulated.devices },
      () =>
        new SimulatedDevice({
          networks: settings.simulated.networks.map((n) => ({ ...n })),
          reach,
        }),
    );
    // The phone asks for Bluetooth once, as it would the first time.
    return new SimulatedRadio(devices, { state: 'ask' });
  }
  const central = phoneCentral();
  return central === null ? new NoRadio() : new BluetoothRadio(central, settings);
}

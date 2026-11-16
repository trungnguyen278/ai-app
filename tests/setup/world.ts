// SPDX-License-Identifier: MIT
// A world for set-up's tests: the simulated cloud, Linh signed in to it with a home, and simulated
// devices in set-up within reach of the simulated radio.
import { cryptoRandom } from '@/src/shared/bytes';
import { SimulatedCloud, type CloudClient } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import type { App } from '@/src/shared/protocols';
import {
  SetupFlow,
  SimulatedDevice,
  SimulatedRadio,
  writeSetupString,
  type Network,
  type Radio,
  type SetupStep,
  type SimulatedDeviceOptions,
  type SimulatedNetwork,
  type SimulatedRadioOptions,
} from '@/src/setup';

import { signedIn } from '../account/render';

// The flow asks a device whose Internet is unknown again at once, a few times: the tests do not
// wait. The scan's time is not the configuration's, so that a test tells which one the flow uses.
const configured = runtimeSettings().setup;
export const SETTINGS = {
  ...configured,
  recheck: 0.001,
  internet_wait: 0.004,
  scan_time: configured.scan_time + 1,
};
export const HOME = { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi'] };
export const NETWORKS: SimulatedNetwork[] = [
  { ssid: 'Nhà Linh', security: 'wpa2', signal: 80, password: 'mật khẩu nhà' },
  { ssid: 'Quán cà phê', security: 'open', signal: 45 },
  { ssid: 'Văn phòng', security: 'other', signal: 30 },
  { ssid: 'Ẩn', security: 'wpa3', signal: 60, password: 'bí mật', hidden: true },
];

export interface WorldOptions {
  devices?: SimulatedDeviceOptions[];
  radio?: SimulatedRadioOptions;
  /** The cloud's settings, beside the configuration's. */
  cloud?: Partial<ReturnType<typeof runtimeSettings>['cloud']['simulated']>;
}

/** A simulated cloud, Linh signed in to it with a home, and devices in set-up within reach. */
export async function world(options: WorldOptions = {}) {
  const { cloud: settings } = runtimeSettings();
  const cloud = new SimulatedCloud({ ...settings.simulated, ...options.cloud }, [
    settings.client_id,
  ]);
  const linh = await signedIn('Linh', cloud);
  const home = await linh.api.createHome(HOME);
  const reach = (server: string) => (server === settings.simulated.server ? cloud : undefined);
  const devices = (options.devices ?? [{}]).map(
    (each) => new SimulatedDevice({ networks: NETWORKS, reach, ...each }),
  );
  const radio = new SimulatedRadio(devices, options.radio);
  return {
    cloud,
    api: linh.api,
    secrets: linh.secrets,
    home,
    devices,
    radio,
    start: starter(radio, linh.api, home),
  };
}

/** A flow for `home`, as `api` speaks, and every step it takes. */
export function starter(defaultRadio: Radio, defaultApi: CloudClient, defaultHome: App.Home) {
  return (overrides: { radio?: Radio; api?: CloudClient; home?: App.Home } = {}) => {
    const flow = new SetupFlow({
      radio: overrides.radio ?? defaultRadio,
      cloud: overrides.api ?? defaultApi,
      home: overrides.home ?? defaultHome,
      session: { random: cryptoRandom, settings: SETTINGS },
      kindName: (kind) => `A ${kind}`,
    });
    const steps: SetupStep[] = [];
    flow.subscribe(() => steps.push(flow.current()));
    return { flow, steps };
  };
}

/** The step the flow comes to rest at, once nothing is under way: the exchange's scrypt takes a
 * while. */
export async function rest(flow: SetupFlow): Promise<SetupStep> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2));
    const step = flow.current();
    if (step.step !== 'working') return step;
  }
  throw new Error('the flow did not come to rest');
}

/** What the QR code on `device`'s screen holds now. */
export function qrOf(device: SimulatedDevice): string {
  return writeSetupString(device.secret.discriminator, device.secret.code);
}

/** The flow, past Bluetooth, with `device`'s QR code scanned. */
export async function scan(flow: SetupFlow, device: SimulatedDevice): Promise<SetupStep> {
  await flow.begin();
  expect(flow.scanned(qrOf(device))).toBe(true);
  // The scan goes on after `scanned` answers: it is under way once the step changes.
  await new Promise((resolve) => setImmediate(resolve));
  return rest(flow);
}

export function listed(step: SetupStep, ssid: string): Network {
  if (step.step !== 'networks') throw new Error(`at ${step.step}, not networks`);
  const network = step.networks.find((each) => each.ssid === ssid);
  if (network === undefined) throw new Error('not listed');
  return network;
}

export function works(steps: SetupStep[]): string[] {
  return steps.flatMap((step) => (step.step === 'working' ? [step.work] : []));
}

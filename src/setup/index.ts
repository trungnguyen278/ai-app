// SPDX-License-Identifier: MIT
// Setting a device up over Bluetooth LE, set-up 2.2 (docs/architecture.md, Modules; ADR-0013 of
// ai-platform): what other modules and the routes may import.
export { radioFor } from './adapters/connect';
export { SimulatedDevice } from './adapters/simulated/device';
export type {
  DeviceServer,
  SetupSecret,
  SimulatedDeviceOptions,
  SimulatedNetwork,
} from './adapters/simulated/device';
export { SimulatedRadio } from './adapters/simulated/radio';
export type { SimulatedRadioOptions } from './adapters/simulated/radio';
export { NoRadio } from './adapters/unavailable';
export {
  groupCode,
  readDiscriminator,
  readSetupString,
  readTypedCode,
  writeSetupString,
} from './domain/code';
export type { SetupString } from './domain/code';
export { DEVICE_ERRORS, DeviceRefused, NotConfirmed, SessionLost } from './domain/errors';
export type { DeviceErrorCode, LossReason } from './domain/errors';
export { fitsPassword, fitsSsid, shownSsid } from './domain/wifi';
export type { Link, LinkListener } from './ports/link';
export type { Nearby, Radio, RadioState } from './ports/radio';
export { SetupFlow } from './services/flow';
export type {
  Failure,
  FlowDependencies,
  HiddenNetwork,
  JoinFault,
  SetupStep,
  Work,
} from './services/flow';
export { greet, Greeting, Session } from './services/session';
export type {
  Configured,
  DeviceInfo,
  JoinRequest,
  Network,
  NetworkStatus,
  SessionOptions,
} from './services/session';
export { RadioProvider, useRadio } from './screens/RadioProvider';
export { SetupScreen } from './screens/SetupScreen';
export { SimulatedDevicesScreen } from './screens/SimulatedDevicesScreen';

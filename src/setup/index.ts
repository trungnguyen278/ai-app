// SPDX-License-Identifier: MIT
// Setting a device up over Bluetooth LE, set-up 2.2 (docs/architecture.md, Modules; ADR-0013 of
// ai-platform): what other modules and the routes may import.
export { SimulatedDevice } from './adapters/simulated/device';
export type {
  SetupSecret,
  SimulatedDeviceOptions,
  SimulatedNetwork,
} from './adapters/simulated/device';
export { readDiscriminator, readSetupString, readTypedCode } from './domain/code';
export type { SetupString } from './domain/code';
export { DEVICE_ERRORS, DeviceRefused, NotConfirmed, SessionLost } from './domain/errors';
export type { DeviceErrorCode, LossReason } from './domain/errors';
export type { Link, LinkListener } from './ports/link';
export { greet, Greeting, Session } from './services/session';
export type {
  Configured,
  DeviceInfo,
  JoinRequest,
  Network,
  NetworkStatus,
  SessionOptions,
} from './services/session';

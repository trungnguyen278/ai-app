// SPDX-License-Identifier: MIT
// The app's link to ai-cloud (ADR-0004): the one client of the app API, over a transport to a
// cloud or to the simulated cloud. What other modules may import of it.
export { FetchTransport } from './adapters/fetch';
export type { Person, ProviderSignIn } from './adapters/simulated/accounts';
export { SimulatedCloud } from './adapters/simulated/cloud';
export type { SimulatedOptions } from './adapters/simulated/cloud';
export { CloudClient, SignInClient } from './client';
export type {
  ClientOptions,
  Credentials,
  ExchangeOptions,
  FreshSignIn,
  PageRequest,
} from './client';
export { cloudTransport } from './connect';
export { failureMessage } from './failures';
export { everyPage } from './paging';
export type { Page } from './paging';
export {
  ABOUT_BLANK,
  INVALID_GRANT,
  OAuthRefused,
  PROBLEM_TYPES,
  PROBLEMS,
  Refused,
  SignedOut,
  Unavailable,
} from './errors';
export type { ProblemCode } from './errors';
export { SIMULATED } from './settings';
export type { CloudSettings, Rate, SimulatedSettings } from './settings';
export { Unreachable } from './transport';
export type { CloudRequest, CloudResponse, Method, Silence, Transport } from './transport';

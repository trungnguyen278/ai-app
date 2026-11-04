// SPDX-License-Identifier: MIT
// The transport that the configuration names (ADR-0004, decision 6).
import { FetchTransport } from './adapters/fetch';
import { SimulatedCloud } from './adapters/simulated/cloud';
import { SIMULATED, type CloudSettings } from './settings';
import type { Transport } from './transport';

/** The simulated cloud, or fetch to the cloud at the configuration's address. */
export function cloudTransport(settings: CloudSettings): Transport {
  if (settings.address === SIMULATED) {
    return new SimulatedCloud(settings.simulated, [settings.client_id]);
  }
  return new FetchTransport(settings.address, settings.timeout, settings.answer_limit);
}

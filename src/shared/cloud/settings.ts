// SPDX-License-Identifier: MIT
// How the app reaches ai-cloud: config/base.toml's [cloud] (ADR-0004, decision 6).

/** The address that runs the app API inside the app, in memory, instead of a cloud's. */
export const SIMULATED = 'simulated';

/** At most `limit` in each `period` of seconds. */
export interface Rate {
  limit: number;
  period: number;
}

/** The simulated cloud's settings: ai-cloud's (the app API, Settings), and its pace. */
export interface SimulatedSettings {
  /** Seconds it takes to answer. */
  latency: number;
  nonce_lifetime: number;
  access_lifetime: number;
  refresh_idle: number;
  recent_sign_in: number;
  idempotency_retention: number;
  homes_per_account: number;
  members_per_home: number;
  invitation_lifetime: number;
  invitations_per_home: number;
  /** Seconds the simulated providers' ID tokens are valid. */
  id_token_lifetime: number;
  nonce_rate: Rate;
  invitation_rate: Rate;
}

/** How the app reaches the cloud; config/base.toml says what each setting is. */
export interface CloudSettings {
  /** `SIMULATED`, or a cloud's address. */
  address: string;
  plain_http: boolean;
  client_id: string;
  /** Seconds. */
  timeout: number;
  retries: number;
  /** Seconds. */
  retry_delay: number;
  page_size: number;
  /** Bytes. */
  answer_limit: number;
  simulated: SimulatedSettings;
}

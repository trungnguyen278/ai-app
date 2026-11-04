// SPDX-License-Identifier: MIT
// The port to ai-cloud (ADR-0004, decision 3): requests and answers as HTTP carries them, sent
// over fetch to a cloud, or to the simulated cloud, which runs the app API in memory. The client
// above it is the same for both, so the tests run its code end to end.

/** The methods the app API uses. */
export type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** A request to the app API. */
export interface CloudRequest {
  readonly method: Method;
  /** Its path from the cloud's address, with its query, such as /app/v1/homes?page_size=20. */
  readonly target: string;
  /** Its header fields, by lower-case name. */
  readonly headers: Readonly<Record<string, string>>;
  /** Its body: JSON, or form fields at the OAuth endpoints. */
  readonly body?: string;
}

/** The cloud's answer. */
export interface CloudResponse {
  readonly status: number;
  /** Its header fields, by lower-case name. */
  readonly headers: Readonly<Record<string, string>>;
  /** Its body, empty when it has none. */
  readonly body: string;
}

/** What carries requests to a cloud and brings its answers back. */
export interface Transport {
  /** The cloud's answer to `request`; `Unreachable` if none came. */
  send(request: CloudRequest): Promise<CloudResponse>;
}

/** Why no answer came. */
export type Silence = 'offline' | 'timeout';

/**
 * No answer came: the phone is offline, the cloud is down or too slow. A request may still
 * have done what it asked, so only one the protocol makes safe to repeat is sent again.
 */
export class Unreachable extends Error {
  constructor(readonly reason: Silence) {
    super(`the cloud did not answer: ${reason}`);
    this.name = 'Unreachable';
  }
}

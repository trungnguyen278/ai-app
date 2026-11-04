// SPDX-License-Identifier: MIT
// The transport to a cloud: fetch, over HTTPS, or HTTP to a developer's own machine (SEC-1),
// with a time limit and a limit on the answer's size (SEC-15).
import { ProtocolError } from '@/src/shared/protocols';

import { Unreachable, type CloudRequest, type CloudResponse, type Transport } from '../transport';

export class FetchTransport implements Transport {
  private readonly address: string;

  constructor(
    /** The cloud's address, such as https://cloud.example; a trailing slash is dropped. */
    address: string,
    /** Seconds a request may take, its answer read. */
    private readonly timeout: number,
    /** The most bytes an answer may have. */
    private readonly answerLimit: number,
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.address = address.endsWith('/') ? address.slice(0, -1) : address;
  }

  async send(request: CloudRequest): Promise<CloudResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout * 1000);
    try {
      const response = await this.fetcher(this.address + request.target, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
        // The app API carries no cookies: none that anything on the way sets rides along.
        credentials: 'omit',
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });
      if (Number(headers['content-length']) > this.answerLimit) {
        controller.abort();
        throw this.tooLarge();
      }
      const body = await response.text();
      // Each UTF-16 unit of the text took at least one byte.
      if (body.length > this.answerLimit) {
        throw this.tooLarge();
      }
      return { status: response.status, headers, body };
    } catch (error) {
      if (error instanceof ProtocolError) throw error;
      throw new Unreachable(controller.signal.aborted ? 'timeout' : 'offline');
    } finally {
      clearTimeout(timer);
    }
  }

  private tooLarge(): ProtocolError {
    return new ProtocolError('answer', '/', `is over ${this.answerLimit} bytes`);
  }
}

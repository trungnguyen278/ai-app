// SPDX-License-Identifier: MIT
// Secrets in memory: for tests, which have no phone's storage.
import type { Secrets } from '../ports/secrets';

export class MemorySecrets implements Secrets {
  readonly kept = new Map<string, string>();

  async get(name: string): Promise<string | null> {
    return this.kept.get(name) ?? null;
  }

  async set(name: string, value: string): Promise<void> {
    this.kept.set(name, value);
  }

  async delete(name: string): Promise<void> {
    this.kept.delete(name);
  }
}

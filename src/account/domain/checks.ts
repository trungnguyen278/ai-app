// SPDX-License-Identifier: MIT
// What people type, checked against the app API's own rules before it goes (ADR-0005).
import { checked, ProtocolError, type AppDefinition } from '@/src/shared/protocols';

/** Whether `value` is what the app API's `definition` describes. */
export function accepts(definition: AppDefinition, value: unknown): boolean {
  try {
    checked(definition, value);
    return true;
  } catch (error) {
    if (error instanceof ProtocolError) return false;
    throw error;
  }
}

// SPDX-License-Identifier: MIT
// The ways a person signs in (ADR-0004, decision 4): Google and Apple, which come with the
// project's client IDs, and the development cloud's provider.
import type { FreshSignIn } from '@/src/shared/cloud';

/** The providers by name, as the configuration lists them (the app API's $defs/provider). */
export type ProviderName = 'development' | 'google' | 'apple';

/** One way to sign in. */
export interface SignInProvider {
  readonly name: ProviderName;
  /** An ID token for the person signing in, carrying the cloud's `nonce`; null if they gave up. */
  signIn(nonce: string): Promise<FreshSignIn | null>;
}

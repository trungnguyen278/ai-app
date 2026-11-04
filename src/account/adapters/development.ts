// SPDX-License-Identifier: MIT
// The development cloud's provider: it signs a test person in by the name and email typed,
// without Google or Apple (the app API, Development). A cloud in production answers 404.
import type { SignInClient } from '@/src/shared/cloud';

import type { SignInProvider } from '../ports/providers';

/** A test person: their email decides who they are, or their name without one. */
export interface TestPerson {
  displayName: string;
  email?: string;
}

export function developmentProvider(client: SignInClient, person: TestPerson): SignInProvider {
  return {
    name: 'development',
    async signIn(nonce) {
      const idToken = await client.developmentIdToken({
        nonce,
        display_name: person.displayName,
        ...(person.email === undefined ? {} : { email: person.email }),
      });
      return { idToken };
    },
  };
}

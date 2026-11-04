// SPDX-License-Identifier: MIT
// The account's screens as the app has them: with the cloud's cache and a session, on the
// simulated cloud, and the secrets in memory.
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AccountProvider, MemorySecrets, useSession } from '@/src/account';
import { refreshTokenName } from '@/src/account/services/session';
import { CloudClient, SignInClient, SimulatedCloud, type Transport } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import { Text } from '@/src/shared/design';
import { newQueryClient } from '@/src/shared/queries';

/** A simulated cloud, as the configuration has it, on the clock given or the machine's. */
export function simulatedCloud(clock?: () => number): SimulatedCloud {
  const { cloud: settings } = runtimeSettings();
  return new SimulatedCloud(settings.simulated, [settings.client_id], { clock });
}

/**
 * A simulated cloud, or the one given, and the secrets of a session signed in on it, as `name`.
 * `api` speaks for the person with the session's first access token, for a test to set the
 * cloud up.
 */
export async function signedIn(name = 'Linh', cloud = simulatedCloud()) {
  const { cloud: settings } = runtimeSettings();
  const client = new SignInClient(cloud, settings);
  const { nonce } = await client.nonce();
  const email = `${name.toLowerCase()}@example.com`;
  const idToken = await client.developmentIdToken({ nonce, display_name: name, email });
  const { refresh_token: token, access_token: access } = await client.exchange(idToken);
  const secrets = new MemorySecrets();
  secrets.kept.set(refreshTokenName(settings.address), token);
  const api = new CloudClient(cloud, settings, {
    accessToken: async () => access,
    renew: async () => null,
  });
  return { cloud, secrets, api };
}

/** The providers the app's root gives every screen, but for the catalog and the design. */
export function Account({
  children,
  transport,
  secrets,
  queries,
}: {
  children: ReactNode;
  transport?: Transport;
  secrets?: MemorySecrets;
  queries?: QueryClient;
}) {
  const [client] = useState(() => queries ?? newQueryClient(runtimeSettings().queries));
  return (
    <QueryClientProvider client={client}>
      <AccountProvider transport={transport} secrets={secrets ?? new MemorySecrets()}>
        {children}
      </AccountProvider>
    </QueryClientProvider>
  );
}

/** The session's status, written out for a test to read. */
export function Status() {
  const { state } = useSession();
  return <Text testID="status">{`${state.status}${state.ended ? ', ended' : ''}`}</Text>;
}

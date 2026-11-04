// SPDX-License-Identifier: MIT
// The account's place in the app: one session, and the clients that speak for it, for every
// screen beneath (Expo Router's guide to authentication keeps the session in a context too).
// It restores the session kept from before as the app starts.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';

import {
  CloudClient,
  cloudTransport,
  SIMULATED,
  SignInClient,
  type Transport,
} from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';

import { MemorySecrets } from './adapters/memory';
import { secureStore } from './adapters/secure-store';
import { ACCOUNT } from './domain/keys';
import { sessionLabel } from './domain/label';
import type { Secrets } from './ports/secrets';
import { refreshTokenName, Session, type SessionState } from './services/session';

interface Account {
  session: Session;
  signIn: SignInClient;
  cloud: CloudClient;
}

const AccountContext = createContext<Account | null>(null);

export interface AccountProviderProps {
  children: ReactNode;
  /** Where requests go: the configured cloud, unless a test gives its own. */
  transport?: Transport;
  /** Where the session is kept, unless a test gives its own. */
  secrets?: Secrets;
}

/** The session, restored as the app starts, and the cloud as it speaks for the person. */
export function AccountProvider({ children, transport, secrets }: AccountProviderProps) {
  const queries = useQueryClient();
  // One account for the app's life, made from what it is given at first.
  const [account] = useState<Account>(() => {
    const settings = runtimeSettings();
    const link = transport ?? cloudTransport(settings.cloud);
    const signIn = new SignInClient(link, settings.cloud);
    // The simulated cloud forgets its sessions when the app stops, and so does the app.
    const simulated = settings.cloud.address === SIMULATED;
    const session = new Session(
      signIn,
      secrets ?? (simulated ? new MemorySecrets() : secureStore),
      settings.session,
      {
        storeAs: refreshTokenName(settings.cloud.address),
        label: sessionLabel(Device.modelName),
        // What the cloud gave for the person goes with their session.
        onEnd: () => queries.clear(),
      },
    );
    return { session, signIn, cloud: new CloudClient(link, settings.cloud, session) };
  });
  useEffect(() => {
    void account.session.restore();
  }, [account]);
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

function useAccount(): Account {
  const account = useContext(AccountContext);
  if (account === null) {
    throw new Error('the account is used outside its AccountProvider');
  }
  return account;
}

/** The session's state, and the session, to sign in and out. */
export function useSession(): { state: SessionState; session: Session; signIn: SignInClient } {
  const { session, signIn } = useAccount();
  const state = useSyncExternalStore(session.subscribe, session.current);
  return { state, session, signIn };
}

/** The app API, as the person signed in. */
export function useCloud(): CloudClient {
  return useAccount().cloud;
}

/** The person signed in: their account, from the cloud's cache. */
export function usePerson() {
  const cloud = useCloud();
  return useQuery({ queryKey: ACCOUNT, queryFn: () => cloud.account() });
}

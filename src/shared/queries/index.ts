// SPDX-License-Identifier: MIT
// The one cache of what the cloud answers (ADR-0002, decision 5; ADR-0004, decision 5), with
// TanStack Query. A read is tried again only when no answer came, or the cloud could not serve
// it; reads come again when the app returns to the front, and wait while the phone is offline.
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { AppState, Platform } from 'react-native';

import { Unavailable, Unreachable } from '@/src/shared/cloud';
import type { QueriesSettings } from '@/src/shared/config';

/**
 * Whether a read that failed with `error` is tried again, after `failures` retries so far:
 * TanStack Query counts from 0, as its own `retry: number` does.
 */
export function retries(settings: QueriesSettings) {
  return (failures: number, error: unknown): boolean =>
    failures < settings.retries && (error instanceof Unreachable || error instanceof Unavailable);
}

/** The app's query cache. */
export function newQueryClient(settings: QueriesSettings): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: retries(settings), staleTime: settings.stale_time * 1000 },
      // The cache sends no change again: the client does, when an Idempotency-Key makes it safe.
      mutations: { retry: false },
    },
  });
}

/**
 * Tell TanStack Query when the app comes to the front, and when the phone goes online or
 * offline (its React Native guide, with expo-network). Returns what stops the first.
 */
export function followTheApp(): () => void {
  const subscription = AppState.addEventListener('change', (status) => {
    if (Platform.OS !== 'web') focusManager.setFocused(status === 'active');
  });
  onlineManager.setEventListener((setOnline) => {
    let known = false;
    const listener = Network.addNetworkStateListener((state) => {
      known = true;
      // Only a phone that says it has no network is offline: one that does not know tries.
      setOnline(state.isConnected !== false);
    });
    Network.getNetworkStateAsync()
      .then((state) => {
        if (!known) setOnline(state.isConnected !== false);
      })
      .catch(() => {
        // Some platforms refuse to say: the phone counts as online.
      });
    return () => listener.remove();
  });
  return () => subscription.remove();
}

// SPDX-License-Identifier: MIT
// The homes as screens read and change them, through the cloud's cache (ADR-0004, decision 5).
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useCloud } from '@/src/account';
import { everyPage, Refused } from '@/src/shared/cloud';
import type { App } from '@/src/shared/protocols';

import { HOMES, invitationsOf, membersOf, previewOf } from '../domain/keys';

/** The homes the person is in, oldest first, every page of them. */
export function useHomes() {
  const cloud = useCloud();
  return useQuery({
    queryKey: HOMES,
    queryFn: () =>
      everyPage(
        (page) => cloud.homes(page),
        (page) => page.homes,
      ),
  });
}

/** The people in a home, oldest first, every page of them. */
export function useMembers(homeId: string) {
  const cloud = useCloud();
  return useQuery({
    queryKey: membersOf(homeId),
    queryFn: () =>
      everyPage(
        (page) => cloud.members(homeId, page),
        (page) => page.members,
      ),
  });
}

/**
 * `home` among the homes the cache holds, at once, for the screen that opens it, and the list
 * read again, in the cloud's order.
 */
function joined(queries: QueryClient, home: App.Home) {
  queries.setQueryData<App.Home[]>(HOMES, (homes) =>
    homes === undefined ? [home] : [...homes.filter((each) => each.id !== home.id), home],
  );
  return queries.invalidateQueries({ queryKey: HOMES });
}

/** Create a home, whose owner is the person. */
export function useCreateHome() {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (home: App.HomeCreate) => cloud.createHome(home),
    onSuccess: (home) => joined(queries, home),
  });
}

/** A home's open invitations, for its owner and admins, every page of them. */
export function useInvitations(homeId: string) {
  const cloud = useCloud();
  return useQuery({
    queryKey: invitationsOf(homeId),
    queryFn: () =>
      everyPage(
        (page) => cloud.invitations(homeId, page),
        (page) => page.invitations,
      ),
  });
}

/**
 * A new invitation, whose code this answer alone carries. The cache forgets it as soon as no
 * screen shows it, since nothing can show it again; the open invitations are read again.
 */
export function useInvite(homeId: string) {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: () => cloud.createInvitation(homeId),
    onSuccess: () => queries.invalidateQueries({ queryKey: invitationsOf(homeId) }),
    gcTime: 0,
  });
}

/**
 * Revoke an open invitation: nobody can join with its code any more; the open ones are read
 * again. One used or expired since the list was read is no longer open, which is what revoking
 * wants, though the cloud answers 404.
 */
export function useRevokeInvitation(homeId: string) {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      try {
        await cloud.revokeInvitation(homeId, invitationId);
      } catch (error) {
        if (!(error instanceof Refused && error.status === 404)) throw error;
      }
    },
    onSuccess: () => queries.invalidateQueries({ queryKey: invitationsOf(homeId) }),
  });
}

/** Add a profile: a person in the home who never signs in. */
export function useAddProfile(homeId: string) {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (displayName: string) => cloud.addProfile(homeId, displayName),
    onSuccess: () => queries.invalidateQueries({ queryKey: membersOf(homeId) }),
  });
}

/**
 * What a person sees of the invitation whose code they hold, before they agree. It is read once,
 * and forgotten as soon as no screen shows it: the code is a secret.
 */
export function useInvitationPreview(code: string | null) {
  const cloud = useCloud();
  return useQuery({
    queryKey: previewOf(code),
    queryFn: () => cloud.lookUpInvitation(code ?? ''),
    enabled: code !== null,
    staleTime: Infinity,
    gcTime: 0,
  });
}

/** Join the home of an invitation; `joined` is false when the person was in it already. */
export function useAccept() {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => cloud.acceptInvitation(code),
    onSuccess: ({ home }) => joined(queries, home),
    gcTime: 0,
  });
}

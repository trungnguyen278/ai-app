// SPDX-License-Identifier: MIT
// The homes as screens read and change them, through the cloud's cache (ADR-0004, decision 5).
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { useCloud } from '@/src/account';
import { everyPage, Refused } from '@/src/shared/cloud';
import type { App } from '@/src/shared/protocols';

import { HOMES, invitationsOf, membersOf, previewOf } from '../domain/keys';
import { demotes } from '../domain/people';

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

/** A person's name in a home, once the people are read: what their screen is called. */
export function usePersonName(homeId: string, memberId: string): string | undefined {
  return useMembers(homeId).data?.find((member) => member.id === memberId)?.display_name;
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

/** A change to a person: their name in the home, or their role. */
export interface PersonChange {
  member: App.Member;
  changes: App.MemberUpdate;
}

/**
 * Change a person, as the screen last read them: a change made meanwhile, by someone else, is
 * refused (412). The person as changed goes into the cache at once, and the people are read
 * again either way. Making an admin a member revokes the invitations they made, so the open ones
 * are read again too: either way as well, since an answer lost may hide a change made.
 */
export function useUpdateMember(homeId: string) {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ member, changes }: PersonChange) =>
      cloud.updateMember(homeId, member.id, changes, member.etag),
    onSuccess: (changed) =>
      queries.setQueryData<App.Member[]>(membersOf(homeId), (members) =>
        members?.map((each) => (each.id === changed.id ? changed : each)),
      ),
    onSettled: (_changed, _error, { member, changes }) => {
      const reads = [queries.invalidateQueries({ queryKey: membersOf(homeId) })];
      if (demotes(member, changes)) {
        reads.push(queries.invalidateQueries({ queryKey: invitationsOf(homeId) }));
      }
      return Promise.all(reads);
    },
  });
}

/**
 * Remove a person from the home, or, for the person who asks, leave it. What belongs to them
 * there goes, and so do the invitations they made. A person who leaves loses the home's data from
 * the cache at once, since the cloud no longer shows it to them.
 */
export function useRemoveMember(homeId: string) {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (member: App.Member) => cloud.removeMember(homeId, member.id),
    onSuccess: (_, member) => {
      if (member.current) {
        queries.removeQueries({ queryKey: ['homes', homeId] });
        queries.setQueryData<App.Home[]>(HOMES, (homes) =>
          homes?.filter((home) => home.id !== homeId),
        );
        return queries.invalidateQueries({ queryKey: HOMES });
      }
      return Promise.all([
        queries.invalidateQueries({ queryKey: membersOf(homeId) }),
        queries.invalidateQueries({ queryKey: invitationsOf(homeId) }),
      ]);
    },
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

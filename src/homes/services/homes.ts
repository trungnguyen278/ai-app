// SPDX-License-Identifier: MIT
// The homes as screens read and change them, through the cloud's cache (ADR-0004, decision 5).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCloud } from '@/src/account';
import { everyPage } from '@/src/shared/cloud';
import type { App } from '@/src/shared/protocols';

import { HOMES, membersOf } from '../domain/keys';

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

/** Create a home, whose owner is the person; the list of homes is read again. */
export function useCreateHome() {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: (home: App.HomeCreate) => cloud.createHome(home),
    onSuccess: (home) => {
      queries.setQueryData<App.Home[]>(HOMES, (homes) =>
        homes === undefined ? [home] : [...homes.filter((each) => each.id !== home.id), home],
      );
      return queries.invalidateQueries({ queryKey: HOMES });
    },
  });
}

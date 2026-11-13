// SPDX-License-Identifier: MIT
// A home's devices as screens read and change them, through the cloud's cache (ADR-0004,
// decision 5).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useCloud } from '@/src/account';
import { everyPage, Refused } from '@/src/shared/cloud';
import type { App } from '@/src/shared/protocols';

import { devicesOf } from '../domain/keys';

/** The devices of a home, every page of them, in the cloud's order. */
export function useDevices(homeId: string) {
  const cloud = useCloud();
  return useQuery({
    queryKey: devicesOf(homeId),
    queryFn: () =>
      everyPage(
        (page) => cloud.devices(homeId, page),
        (page) => page.devices,
      ),
  });
}

/** A device of a home, once its devices are read. */
export function useDevice(homeId: string, deviceId: string): App.Device | undefined {
  return useDevices(homeId).data?.find((device) => device.id === deviceId);
}

/** A device that can be renamed: one with an ETag, which only a cloud of 1.4 leaves out, and
 *  that cloud renames nothing. */
export type Renamable = App.Device & { etag: string };

/** Whether `device` can be renamed. */
export function isRenamable(device: App.Device): device is Renamable {
  return device.etag !== undefined;
}

/** A new name for a device, as the screen last read it. */
export interface Rename {
  device: Renamable;
  name: string;
}

/**
 * Rename a device, as the screen last read it: a change made meanwhile, by someone else, is
 * refused (412). The device as renamed goes into the cache at once, and the devices are read
 * again either way, since an answer lost may hide a change made.
 */
export function useRenameDevice(homeId: string) {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: ({ device, name }: Rename) =>
      cloud.updateDevice(homeId, device.id, { name }, device.etag),
    onSuccess: (renamed) =>
      queries.setQueryData<App.Device[]>(devicesOf(homeId), (devices) =>
        devices?.map((each) => (each.id === renamed.id ? renamed : each)),
      ),
    onSettled: () => queries.invalidateQueries({ queryKey: devicesOf(homeId) }),
  });
}

/**
 * Remove a device from the home, which only unlinks it (PROV-4): the cloud forgets its key, and
 * the device offers set-up again. One removed meanwhile, by someone else, is gone, which is what
 * removing wants, though the cloud answers 404. The devices are read again either way.
 */
export function useRemoveDevice(homeId: string) {
  const cloud = useCloud();
  const queries = useQueryClient();
  return useMutation({
    mutationFn: async (device: App.Device) => {
      try {
        await cloud.removeDevice(homeId, device.id);
      } catch (error) {
        if (!(error instanceof Refused && error.status === 404)) throw error;
      }
    },
    onSettled: () => queries.invalidateQueries({ queryKey: devicesOf(homeId) }),
  });
}

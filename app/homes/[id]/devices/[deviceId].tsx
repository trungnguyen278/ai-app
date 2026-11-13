// SPDX-License-Identifier: MIT
import { Stack, useLocalSearchParams } from 'expo-router';

import { DeviceScreen, useDeviceName } from '@/src/devices';
import { useText } from '@/src/shared/catalog';

/** One device of a home, under its name once it is read: a notification or a link can open it. */
export default function Device() {
  const text = useText();
  const { id, deviceId } = useLocalSearchParams<{ id: string; deviceId: string }>();
  const name = useDeviceName(id, deviceId);
  return (
    <>
      <Stack.Screen options={{ title: name ?? text('devices.device.title') }} />
      <DeviceScreen homeId={id} deviceId={deviceId} />
    </>
  );
}

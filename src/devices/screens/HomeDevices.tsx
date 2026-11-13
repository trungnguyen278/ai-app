// SPDX-License-Identifier: MIT
import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { failureMessage } from '@/src/shared/cloud';
import { Notice, Press, RADIUS, Skeleton, SPACE, Text, TYPE } from '@/src/shared/design';
import type { App } from '@/src/shared/protocols';

import { useDevices } from '../services/devices';
import { useDeviceNames } from './names';

/**
 * A home's devices, on its screen, as Google's Home and Apple's Home show them there: each by
 * its name, and whether it is online, leading to its page.
 */
export function HomeDevices({ home }: { home: App.Home }) {
  const text = useText();
  const devices = useDevices(home.id);
  return (
    <View style={styles.section}>
      <Text variant="heading">{text('devices.title')}</Text>
      {devices.isPending ? (
        <Skeleton width="50%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
      ) : devices.isError ? (
        <Notice role="alert" ink="danger">
          {text(failureMessage(devices.error))}
        </Notice>
      ) : devices.data.length === 0 ? (
        <Text ink="textMuted">{text('devices.empty')}</Text>
      ) : (
        <View>
          {devices.data.map((device) => (
            <Device key={device.id} homeId={home.id} device={device} />
          ))}
        </View>
      )}
    </View>
  );
}

/** A device in the home: its name, and whether it is online. */
function Device({ homeId, device }: { homeId: string; device: App.Device }) {
  const text = useText();
  const nameOf = useDeviceNames();
  const name = nameOf(device);
  const status = text(device.connected ? 'devices.online' : 'devices.offline');
  return (
    <Link href={`/homes/${homeId}/devices/${device.id}`} asChild>
      <Press feedback="light" accessibilityLabel={text('devices.row', { name, status })}>
        <View style={styles.device}>
          <Text>{name}</Text>
          <Text variant="caption" ink="textMuted">
            {status}
          </Text>
        </View>
      </Press>
    </Link>
  );
}

const styles = StyleSheet.create({
  section: { gap: SPACE.md },
  device: { paddingVertical: SPACE.sm },
});

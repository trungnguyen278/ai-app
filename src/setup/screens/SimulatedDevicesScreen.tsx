// SPDX-License-Identifier: MIT
import { useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { Button, QrCode, RADIUS, Screen, SPACE, Text, useTheme } from '@/src/shared/design';

import type { SimulatedDevice } from '../adapters/simulated/device';
import { SimulatedRadio } from '../adapters/simulated/radio';
import { groupCode, writeSetupString } from '../domain/code';
import { useRadio } from './RadioProvider';

/** The side of each device's QR code, in points. */
const QR_SIDE = 160;

/**
 * The simulated radio's devices, as their screens would show them: the code to scan or type, and
 * set-up to open again, as the owner would on the device. In the studio, which the development app
 * alone has (ADR-0003).
 */
export function SimulatedDevicesScreen() {
  const text = useText();
  const radio = useRadio();
  if (!(radio instanceof SimulatedRadio) || radio.devices.length === 0) {
    return (
      <Screen style={styles.page}>
        <Text ink="textMuted">{text('setup.simulated.none')}</Text>
      </Screen>
    );
  }
  return (
    <Screen scroll style={styles.page}>
      <Text ink="textMuted">{text('setup.simulated.lead')}</Text>
      {radio.devices.map((device, index) => (
        <DeviceFace key={device.id} device={device} number={index + 1} />
      ))}
    </Screen>
  );
}

/** What one device's screen shows: its code while set-up is open, and whether it is bound. */
function DeviceFace({ device, number }: { device: SimulatedDevice; number: number }) {
  const text = useText();
  const { color } = useTheme();
  // What its screen shows changes with each code drawn, and as set-up opens and closes.
  useSyncExternalStore(
    (watcher) => device.subscribe(watcher),
    () => `${device.open}:${device.advertising}:${device.bound}:${device.secret.code}`,
  );
  const { code, discriminator } = device.secret;
  const state = !device.open
    ? device.bound
      ? 'bound'
      : 'closed'
    : device.advertising
      ? 'open'
      : 'session';
  return (
    <View style={[styles.device, { borderColor: color.outline, backgroundColor: color.fill }]}>
      <Text variant="heading">{text('setup.simulated.device', { number })}</Text>
      <Text ink="textMuted">{text(`setup.simulated.state.${state}`)}</Text>
      {device.open && (
        <>
          <QrCode
            value={writeSetupString(discriminator, code)}
            size={QR_SIDE}
            accessibilityLabel={text('setup.simulated.qr', { discriminator })}
          />
          <Text variant="title" selectable>
            {groupCode(code)}
          </Text>
          <Text ink="textMuted">{text('setup.simulated.discriminator', { discriminator })}</Text>
        </>
      )}
      {device.open ? (
        <Button
          variant="secondary"
          label={text('setup.simulated.close')}
          onPress={() => device.closeSetUp()}
        />
      ) : (
        <Button
          variant="secondary"
          label={text('setup.simulated.open')}
          onPress={() => device.openSetUp()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.lg },
  device: { gap: SPACE.sm, padding: SPACE.md, borderRadius: RADIUS.lg, borderWidth: 1 },
});

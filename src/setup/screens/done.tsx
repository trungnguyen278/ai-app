// SPDX-License-Identifier: MIT
// The end of set-up: the device's name, then the device, once it is online; or a device that has
// another network now.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { isRenamable, useDeviceNames, useDevices, useRenameDevice } from '@/src/devices';
import { useText } from '@/src/shared/catalog';
import { failureMessage, Refused } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import { Button, haptic, Notice, Pulse, Screen, SPACE, Text, TextField } from '@/src/shared/design';
import { accepts, type App } from '@/src/shared/protocols';

import { shownSsid } from '../domain/wifi';
import type { NetworkStatus } from '../services/session';

/** The device is in the home: its name, then its arrival online. */
export function Added({
  home,
  device,
  added,
}: {
  home: App.Home;
  device: App.Device;
  added: boolean;
}) {
  const [named, setNamed] = useState(false);
  if (named) {
    return <Ready home={home} device={device} />;
  }
  return <Name home={home} device={device} added={added} onNamed={() => setNamed(true)} />;
}

/**
 * The device's name in the home, the one its registration brought, ready to accept with one tap
 * or to change first (ADR-0013 of ai-platform, decision 6).
 */
function Name({
  home,
  device,
  added,
  onNamed,
}: {
  home: App.Home;
  device: App.Device;
  added: boolean;
  onNamed: () => void;
}) {
  const text = useText();
  const nameOf = useDeviceNames();
  const rename = useRenameDevice(home.id);
  // The device as last read, whose ETag a rename goes with: read again after a refusal.
  const current = useDevices(home.id).data?.find((each) => each.id === device.id) ?? device;
  const given = nameOf(device);
  const [typed, setTyped] = useState(given);
  const [fault, setFault] = useState<string>();

  function submit() {
    const chosen = typed.trim();
    if (!accepts('name', chosen)) {
      haptic('error');
      setFault(text('setup.name.error'));
      return;
    }
    setFault(undefined);
    if (chosen === given || !isRenamable(current)) {
      onNamed();
      return;
    }
    rename.mutate(
      { device: current, name: chosen },
      {
        onSuccess: () => {
          haptic('success');
          onNamed();
        },
        // Renamed meanwhile, by someone else: what the person typed stays, to send again.
        onError: () => haptic('error'),
      },
    );
  }

  return (
    <Screen scroll style={styles.page}>
      <Text variant="title">{text('setup.name.title')}</Text>
      <Text>{text(added ? 'setup.name.added' : 'setup.name.known', { home: home.name })}</Text>
      <TextField
        testID="setup-name"
        label={text('setup.name')}
        hint={text('setup.name.hint')}
        kind="name"
        value={typed}
        onChangeText={setTyped}
        error={fault}
        returnKeyType="done"
        onSubmitEditing={submit}
        disabled={rename.isPending}
      />
      {rename.isError && (
        <Notice role="alert" ink="danger">
          {rename.error instanceof Refused && rename.error.stale
            ? text('setup.name.changed')
            : text(failureMessage(rename.error))}
        </Notice>
      )}
      <Button label={text('setup.continue')} onPress={submit} busy={rename.isPending} />
    </Screen>
  );
}

/**
 * Waiting for the device to reach the cloud, then "Ready", and its page (ADR-0013, decision 7).
 * The home's devices are read again until it is online; one that takes longer than the setting
 * `online_timeout` is said to, with what to check.
 */
function Ready({ home, device }: { home: App.Home; device: App.Device }) {
  const text = useText();
  const nameOf = useDeviceNames();
  const { online_poll, online_timeout } = runtimeSettings().setup;
  const devices = useDevices(home.id, { deviceId: device.id, interval: online_poll });
  const now = devices.data?.find((each) => each.id === device.id) ?? device;
  const name = nameOf(now);
  const online = now.connected === true;
  const [late, setLate] = useState(false);
  useEffect(() => {
    if (online) return;
    const timer = setTimeout(() => setLate(true), online_timeout * 1000);
    return () => clearTimeout(timer);
  }, [online, online_timeout]);
  useEffect(() => {
    if (online) haptic('success');
  }, [online]);
  const open = () => router.replace(`/homes/${home.id}/devices/${device.id}`);

  return (
    <Screen scroll style={styles.page}>
      {online ? (
        <Text variant="title">{text('setup.ready.title', { name })}</Text>
      ) : (
        <View style={styles.waiting}>
          <Pulse />
        </View>
      )}
      <Notice role="status">
        {text(online ? 'setup.ready.online' : 'setup.ready.waiting', { name })}
      </Notice>
      {!online && late && (
        <Notice role="alert" ink="danger">
          {text('setup.ready.late', { name })}
        </Notice>
      )}
      <Button
        variant={online ? 'primary' : 'secondary'}
        label={text(online ? 'setup.done' : 'setup.ready.open')}
        onPress={open}
      />
    </Screen>
  );
}

/** A device of the person's homes on another network now: it is in its home already, and its
 * registration does not change (set-up 2.2, How the app runs it). */
export function Moved({
  homeId,
  deviceId,
  network,
}: {
  homeId: string;
  deviceId: string;
  network: NetworkStatus;
}) {
  const text = useText();
  const named = network.ssid !== undefined || network.ssid_hex !== undefined;
  return (
    <Screen scroll style={styles.page}>
      <Text variant="title">{text('setup.moved.title')}</Text>
      <Notice role="status">
        {named
          ? text('setup.moved.network', { network: shownSsid(network) })
          : text('setup.moved.lead')}
      </Notice>
      <Button
        label={text('setup.done')}
        onPress={() => router.replace(`/homes/${homeId}/devices/${deviceId}`)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.md },
  waiting: { alignItems: 'center', paddingVertical: SPACE.lg },
});

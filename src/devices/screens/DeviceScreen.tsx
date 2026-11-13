// SPDX-License-Identifier: MIT
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { mayManage, OneHome } from '@/src/homes';
import { useText } from '@/src/shared/catalog';
import { failureMessage, Refused } from '@/src/shared/cloud';
import {
  Button,
  haptic,
  Notice,
  RADIUS,
  Screen,
  Skeleton,
  SPACE,
  Text,
  TextField,
  TYPE,
} from '@/src/shared/design';
import { accepts, type App } from '@/src/shared/protocols';

import { kindOf } from '../domain/kinds';
import {
  isRenamable,
  useDevices,
  useRemoveDevice,
  useRenameDevice,
  type Renamable,
} from '../services/devices';
import { useDeviceNames } from './names';

/**
 * One device of a home, as Apple's Home and Google's Home show one: its name and whether it is
 * online, what it is, and, for the owner and admins, renaming it and removing it from the home.
 * Two devices may share a name: their pages tell them apart.
 */
export function DeviceScreen({ homeId, deviceId }: { homeId: string; deviceId: string }) {
  return <OneHome homeId={homeId}>{(home) => <Device home={home} deviceId={deviceId} />}</OneHome>;
}

function Device({ home, deviceId }: { home: App.Home; deviceId: string }) {
  const text = useText();
  const devices = useDevices(home.id);
  if (devices.isPending) {
    return (
      <Screen style={styles.page}>
        <View accessibilityLabel={text('devices.device.loading')} style={styles.page}>
          <Skeleton width="60%" height={TYPE.title.lineHeight} radius={RADIUS.sm} />
          <Skeleton width="30%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
        </View>
      </Screen>
    );
  }
  if (devices.isError) {
    return (
      <Screen style={styles.page}>
        <Notice role="alert" ink="danger">
          {text(failureMessage(devices.error))}
        </Notice>
        <Button
          variant="secondary"
          label={text('devices.retry')}
          onPress={() => void devices.refetch()}
        />
      </Screen>
    );
  }
  const device = devices.data.find((each) => each.id === deviceId);
  if (device === undefined) {
    return (
      <Screen style={styles.page}>
        <Text ink="textMuted">{text('devices.device.missing')}</Text>
      </Screen>
    );
  }
  return <DeviceView home={home} device={device} />;
}

function DeviceView({ home, device }: { home: App.Home; device: App.Device }) {
  const text = useText();
  const nameOf = useDeviceNames();
  const manages = mayManage(home.role);
  const name = nameOf(device);
  return (
    <Screen scroll style={styles.page}>
      <View style={styles.heading}>
        {manages && isRenamable(device) ? (
          <NameField homeId={home.id} device={device} name={name} />
        ) : (
          <Text variant="title">{name}</Text>
        )}
        <Text ink="textMuted">{text(device.connected ? 'devices.online' : 'devices.offline')}</Text>
      </View>
      <About device={device} />
      {manages && <Remove home={home} device={device} name={name} />}
    </Screen>
  );
}

/**
 * The device's name, which the owner and admins change: sent with the ETag the page read, so
 * that a name changed meanwhile, by someone else, is refused, and the field keeps what the
 * person typed, to save again over the name now read, if they still want it.
 */
function NameField({ homeId, device, name }: { homeId: string; device: Renamable; name: string }) {
  const text = useText();
  const rename = useRenameDevice(homeId);
  const [typed, setTyped] = useState<string>();
  const [fault, setFault] = useState<string>();
  const changed = typed !== undefined && typed.trim() !== name;

  function save() {
    const chosen = (typed ?? name).trim();
    if (!accepts('name', chosen)) {
      haptic('error');
      setFault(text('devices.device.name.error'));
      return;
    }
    setFault(undefined);
    rename.mutate(
      { device, name: chosen },
      {
        onSuccess: () => {
          haptic('success');
          setTyped(undefined);
        },
        onError: () => haptic('error'),
      },
    );
  }

  return (
    <>
      <TextField
        testID="device-name"
        label={text('devices.device.name')}
        hint={text('devices.device.name.hint')}
        kind="name"
        value={typed ?? name}
        onChangeText={setTyped}
        error={fault}
        returnKeyType="done"
        onSubmitEditing={save}
        disabled={rename.isPending}
      />
      {changed && (
        <Button label={text('devices.device.save')} onPress={save} busy={rename.isPending} />
      )}
      {rename.isError && (
        <Notice role="alert" ink="danger">
          {refusal(text, rename.error, 'devices.device.changed')}
        </Notice>
      )}
    </>
  );
}

/** What the device is: its kind, model and software, once it has said, and when it was added. */
function About({ device }: { device: App.Device }) {
  const text = useText();
  const facts: [string, string][] = [
    [text('devices.device.kind'), text(`devices.kind.${kindOf(device.kind)}`)],
  ];
  if (device.model !== undefined) facts.push([text('devices.device.model'), device.model]);
  if (device.software !== undefined) {
    facts.push([text('devices.device.software'), device.software]);
  }
  facts.push([
    text('devices.device.added'),
    text('devices.device.added.time', { time: new Date(device.create_time) }),
  ]);
  return (
    <View style={styles.section}>
      <Text variant="heading">{text('devices.device.about')}</Text>
      {facts.map(([label, value]) => (
        <View key={label} style={styles.fact}>
          <Text variant="caption" ink="textMuted">
            {label}
          </Text>
          <Text>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Removing the device from the home, confirmed first in the phone's own dialog, which says what
 * removing leaves on the device (PROV-4): it only unlinks it, so the device keeps its network,
 * its name and its settings, and its owner resets it before giving it away.
 */
function Remove({ home, device, name }: { home: App.Home; device: App.Device; name: string }) {
  const text = useText();
  const remove = useRemoveDevice(home.id);

  function confirm() {
    Alert.alert(
      text('devices.device.remove.title', { name }),
      text('devices.device.remove.message', { home: home.name }),
      [
        { text: text('devices.device.cancel'), style: 'cancel' },
        {
          text: text('devices.device.remove.confirm'),
          style: 'destructive',
          onPress: () =>
            remove.mutate(device, {
              onSuccess: () => {
                haptic('success');
                // A page that a link opened has no page to go back to: the home's, then.
                if (router.canGoBack()) router.back();
                else router.replace(`/homes/${home.id}`);
              },
              onError: () => haptic('error'),
            }),
        },
      ],
    );
  }

  return (
    <View style={styles.section}>
      {remove.isError && (
        <Notice role="alert" ink="danger">
          {refusal(text, remove.error)}
        </Notice>
      )}
      <Button
        variant="danger"
        label={text('devices.device.remove')}
        onPress={confirm}
        busy={remove.isPending}
      />
    </View>
  );
}

/**
 * What the page says of `error`, which refused a change: `stale`, when the change went with an
 * ETag and someone changed the device meanwhile.
 */
function refusal(text: ReturnType<typeof useText>, error: Error, stale?: string): string {
  if (stale !== undefined && error instanceof Refused && error.stale) return text(stale);
  if (error instanceof Refused && error.is('role_required')) {
    return text('devices.device.not_allowed');
  }
  return text(failureMessage(error));
}

const styles = StyleSheet.create({
  page: { gap: SPACE.xl },
  heading: { gap: SPACE.sm },
  section: { gap: SPACE.md },
  fact: { gap: SPACE.xs },
});

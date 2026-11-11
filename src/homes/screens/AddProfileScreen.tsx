// SPDX-License-Identifier: MIT
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { failureMessage, Refused } from '@/src/shared/cloud';
import { Button, haptic, Notice, Screen, SPACE, Text, TextField } from '@/src/shared/design';
import { accepts, type App } from '@/src/shared/protocols';

import { useAddProfile } from '../services/homes';
import { OneHome } from './OneHome';

/**
 * A profile: a person in the home who never signs in, as Home Assistant's people without a
 * login (ai-platform ADR-0009, decision 4). The owner or an admin gives their name.
 */
export function AddProfileScreen({ homeId }: { homeId: string }) {
  return <OneHome homeId={homeId}>{(home) => <AddProfile home={home} />}</OneHome>;
}

function AddProfile({ home }: { home: App.Home }) {
  const text = useText();
  const add = useAddProfile(home.id);
  const [name, setName] = useState('');
  const [fault, setFault] = useState<string>();

  function submit() {
    const chosen = name.trim();
    if (!accepts('name', chosen)) {
      haptic('error');
      setFault(text('homes.profile.name.error'));
      return;
    }
    setFault(undefined);
    add.mutate(chosen, {
      onSuccess: () => {
        haptic('success');
        router.back();
      },
      onError: () => haptic('error'),
    });
  }

  const failure =
    add.error === null
      ? undefined
      : add.error instanceof Refused && add.error.is('member_limit_reached')
        ? text('homes.profile.limit')
        : text(failureMessage(add.error));

  return (
    <Screen scroll style={styles.page}>
      <Text ink="textMuted">{text('homes.profile.lead', { home: home.name })}</Text>
      <TextField
        testID="profile-name"
        label={text('homes.profile.name')}
        kind="name"
        value={name}
        onChangeText={setName}
        error={fault}
        returnKeyType="done"
        onSubmitEditing={submit}
        disabled={add.isPending}
      />
      <Button label={text('homes.profile.submit')} onPress={submit} busy={add.isPending} />
      {failure !== undefined && (
        <Notice role="alert" ink="danger">
          {failure}
        </Notice>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.xl },
});

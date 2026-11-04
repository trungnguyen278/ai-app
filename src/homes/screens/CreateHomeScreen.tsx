// SPDX-License-Identifier: MIT
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { usePerson } from '@/src/account';
import { usePlainText, useText } from '@/src/shared/catalog';
import { failureMessage, Refused } from '@/src/shared/cloud';
import { Button, haptic, Screen, SPACE, Text, TextField } from '@/src/shared/design';
import { accepts } from '@/src/shared/protocols';

import { phoneLanguages, phoneTimeZone } from '../domain/defaults';
import { useCreateHome } from '../services/homes';

/**
 * A new home, as Google's Home creates one: a name, which starts as the person's own home, and
 * the phone's time zone and languages, which the home's robots will keep until told otherwise.
 */
export function CreateHomeScreen() {
  const text = useText();
  // The default name becomes the home's, so it carries no invisible marks.
  const plain = usePlainText();
  const person = usePerson();
  const create = useCreateHome();
  const [timeZone] = useState(phoneTimeZone);
  const [languages] = useState(phoneLanguages);
  const [typed, setTyped] = useState<string>();
  const [fault, setFault] = useState<string>();
  const ownName = person.data?.display_name;
  const name =
    typed ?? (ownName === undefined ? '' : plain('homes.new.name.default', { name: ownName }));

  function submit() {
    const chosen = name.trim();
    if (!accepts('name', chosen)) {
      haptic('error');
      setFault(text('homes.new.name.error'));
      return;
    }
    setFault(undefined);
    create.mutate(
      { name: chosen, time_zone: timeZone, languages },
      {
        onSuccess: (home) => {
          haptic('success');
          router.replace(`/homes/${home.id}`);
        },
        onError: () => haptic('error'),
      },
    );
  }

  const failure =
    create.error === null
      ? undefined
      : create.error instanceof Refused && create.error.is('home_limit_reached')
        ? text('homes.new.limit')
        : text(failureMessage(create.error));

  return (
    <Screen scroll style={styles.page}>
      <TextField
        testID="home-name"
        label={text('homes.new.name')}
        hint={text('homes.new.name.hint')}
        value={name}
        onChangeText={setTyped}
        error={fault}
        returnKeyType="done"
        onSubmitEditing={submit}
        disabled={create.isPending}
      />
      <View style={styles.fact}>
        <Text variant="label">{text('homes.new.time_zone')}</Text>
        <Text>{timeZone}</Text>
      </View>
      <View style={styles.fact}>
        <Text variant="label">{text('homes.new.languages')}</Text>
        <Text>{languages.join(', ')}</Text>
        <Text variant="caption" ink="textMuted">
          {text('homes.new.from_phone')}
        </Text>
      </View>
      <Button label={text('homes.new.submit')} onPress={submit} busy={create.isPending} />
      {failure !== undefined && (
        <Text ink="danger" accessibilityRole="alert">
          {failure}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.xl },
  fact: { gap: SPACE.xs },
});

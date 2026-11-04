// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { failureMessage } from '@/src/shared/cloud';
import { Button, RADIUS, Screen, Skeleton, SPACE, Text, TYPE } from '@/src/shared/design';

import { usePerson, useSession } from '../AccountProvider';

/** The person signed in: their name and email, and signing out. */
export function AccountScreen() {
  const text = useText();
  const { session } = useSession();
  const account = usePerson();
  const [leaving, setLeaving] = useState(false);
  return (
    <Screen scroll style={styles.page}>
      {account.isPending ? (
        <View style={styles.person} accessibilityLabel={text('account.loading')}>
          <Skeleton width="60%" height={TYPE.title.lineHeight} radius={RADIUS.sm} />
          <Skeleton width="40%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
        </View>
      ) : account.isError ? (
        <View style={styles.person}>
          <Text ink="danger" accessibilityRole="alert">
            {text(failureMessage(account.error))}
          </Text>
          <Button
            variant="secondary"
            label={text('account.retry')}
            onPress={() => void account.refetch()}
          />
        </View>
      ) : (
        <View style={styles.person}>
          <Text variant="title">{account.data.display_name}</Text>
          {account.data.email !== undefined && <Text ink="textMuted">{account.data.email}</Text>}
        </View>
      )}
      <Button
        variant="secondary"
        label={text('account.sign_out')}
        busy={leaving}
        onPress={() => {
          setLeaving(true);
          void session.signOut();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.xxl },
  person: { gap: SPACE.sm },
});

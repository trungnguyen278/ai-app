// SPDX-License-Identifier: MIT
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { failureMessage, Refused } from '@/src/shared/cloud';
import {
  Button,
  haptic,
  RADIUS,
  Screen,
  Skeleton,
  SPACE,
  Text,
  TextField,
  TYPE,
} from '@/src/shared/design';
import { accepts, type App } from '@/src/shared/protocols';

import { hasAccount, roleOf } from '../domain/people';
import { mayLeave, mayRemove, mayRename } from '../domain/permissions';
import { useMembers, useRemoveMember, useUpdateMember } from '../services/homes';
import { OneHome } from './OneHome';

/**
 * One person in a home, as Google Home's household shows one: their name there and what they
 * are, and what the role of the person who looks lets them do: rename them, remove them, or,
 * for themself, leave. What cannot be undone is confirmed first, in the phone's own dialog.
 */
export function PersonScreen({ homeId, memberId }: { homeId: string; memberId: string }) {
  return <OneHome homeId={homeId}>{(home) => <Person home={home} memberId={memberId} />}</OneHome>;
}

function Person({ home, memberId }: { home: App.Home; memberId: string }) {
  const text = useText();
  const members = useMembers(home.id);
  if (members.isPending) {
    return (
      <Screen style={styles.page}>
        <View accessibilityLabel={text('homes.person.loading')} style={styles.page}>
          <Skeleton width="60%" height={TYPE.title.lineHeight} radius={RADIUS.sm} />
          <Skeleton width="30%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
        </View>
      </Screen>
    );
  }
  if (members.isError) {
    return (
      <Screen style={styles.page}>
        <Text ink="danger" accessibilityRole="alert">
          {text(failureMessage(members.error))}
        </Text>
        <Button
          variant="secondary"
          label={text('homes.retry')}
          onPress={() => void members.refetch()}
        />
      </Screen>
    );
  }
  const member = members.data.find((each) => each.id === memberId);
  if (member === undefined) {
    return (
      <Screen style={styles.page}>
        <Text ink="textMuted">{text('homes.person.missing')}</Text>
      </Screen>
    );
  }
  return <PersonView home={home} member={member} />;
}

function PersonView({ home, member }: { home: App.Home; member: App.Member }) {
  const text = useText();
  const update = useUpdateMember(home.id);
  const remove = useRemoveMember(home.id);
  const [typed, setTyped] = useState<string>();
  const [fault, setFault] = useState<string>();
  const renamable = mayRename(home.role, member);
  const name = typed ?? member.display_name;
  const changed = typed !== undefined && typed.trim() !== member.display_name;
  const what = hasAccount(member.kind)
    ? text(`homes.role.${roleOf(member.role)}`)
    : text('homes.kind.profile');

  function save() {
    const chosen = name.trim();
    if (!accepts('name', chosen)) {
      haptic('error');
      setFault(text('homes.person.name.error'));
      return;
    }
    setFault(undefined);
    // A name changed meanwhile by someone else is refused: the field keeps what the person typed,
    // to save again over the name now read, if they still want it.
    update.mutate(
      { member, changes: { display_name: chosen } },
      {
        onSuccess: () => {
          haptic('success');
          setTyped(undefined);
        },
        onError: () => haptic('error'),
      },
    );
  }

  /** Ask before `then`, which cannot be undone: the phone's own dialog, with its cancel. */
  function confirm(title: string, message: string, action: string, then: () => void) {
    Alert.alert(title, message, [
      { text: text('homes.person.cancel'), style: 'cancel' },
      { text: action, style: 'destructive', onPress: then },
    ]);
  }

  function removeThem() {
    confirm(
      text('homes.person.remove.title', { name: member.display_name }),
      text(hasAccount(member.kind) ? 'homes.person.remove.account' : 'homes.person.remove.profile'),
      text('homes.person.remove.confirm'),
      () =>
        remove.mutate(member, {
          onSuccess: () => {
            haptic('success');
            router.back();
          },
          onError: () => haptic('error'),
        }),
    );
  }

  function leave() {
    confirm(
      text('homes.person.leave.title', { home: home.name }),
      text('homes.person.leave.message'),
      text('homes.person.leave.confirm'),
      () =>
        remove.mutate(member, {
          onSuccess: () => {
            haptic('success');
            router.replace('/');
          },
          onError: () => haptic('error'),
        }),
    );
  }

  const error = update.error ?? remove.error;
  const failure =
    error === null
      ? undefined
      : error instanceof Refused && error.stale
        ? text('homes.person.changed')
        : error instanceof Refused && error.is('role_required')
          ? text('homes.person.not_allowed')
          : text(failureMessage(error));

  return (
    <Screen scroll style={styles.page}>
      <View style={styles.heading}>
        {renamable ? (
          <TextField
            testID="person-name"
            label={text('homes.person.name')}
            hint={text('homes.person.name.hint')}
            kind="name"
            value={name}
            onChangeText={setTyped}
            error={fault}
            returnKeyType="done"
            onSubmitEditing={save}
            disabled={update.isPending}
          />
        ) : (
          <Text variant="title">{member.display_name}</Text>
        )}
        <Text ink="textMuted">{what}</Text>
      </View>
      {changed && (
        <Button label={text('homes.person.save')} onPress={save} busy={update.isPending} />
      )}
      {failure !== undefined && (
        <Text ink="danger" accessibilityRole="alert">
          {failure}
        </Text>
      )}
      {mayRemove(home.role, member) && (
        <Button
          variant="danger"
          label={text('homes.person.remove')}
          onPress={removeThem}
          busy={remove.isPending}
        />
      )}
      {member.current && mayLeave(home.role) && (
        <Button
          variant="danger"
          label={text('homes.person.leave')}
          onPress={leave}
          busy={remove.isPending}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.xl },
  heading: { gap: SPACE.sm },
});

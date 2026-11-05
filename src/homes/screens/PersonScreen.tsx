// SPDX-License-Identifier: MIT
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { failureMessage, Refused } from '@/src/shared/cloud';
import {
  Button,
  ChoiceList,
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

import { demotes, GIVEN_ROLES, hasAccount, roleOf, type GivenRole } from '../domain/people';
import { mayLeave, mayRemove, mayRename, maySetRole } from '../domain/permissions';
import { useMembers, useRemoveMember, useUpdateMember } from '../services/homes';
import { OneHome } from './OneHome';

/**
 * One person in a home, as Google Home's household shows one: their name there and what they
 * are, and what the role of the person who looks lets them do: rename them, make them an admin
 * or a member, remove them, or, for themself, leave. What cannot be undone is confirmed first,
 * in the phone's own dialog.
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
  // The change under way, or the last one: a name or a role. Both are sent with the ETag the
  // page read, so they go one at a time: a second sent meanwhile would be refused as stale, as
  // if someone else had changed the person.
  const change = update.variables?.changes;
  const renaming = update.isPending && change?.display_name !== undefined;
  const choosing = update.isPending ? change?.role : undefined;
  // maySetRole leaves the owner out: anyone else with an account is an admin, or a member.
  const role: GivenRole = roleOf(member.role) === 'admin' ? 'admin' : 'member';
  const roles = GIVEN_ROLES.map((each) => ({
    value: each,
    label: text(`homes.role.${each}`),
    detail: text(`homes.person.role.${each}`),
  }));

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

  /**
   * Give the person `chosen`, at once, as the platforms' lists of options do: the choice shows
   * it while the cloud is asked, and goes back to the role the cloud has if it refuses.
   */
  function choose(chosen: GivenRole) {
    update.mutate({ member, changes: { role: chosen } }, { onError: () => haptic('error') });
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

  /**
   * What the page says of `error`, which refused a change: `stale`, when the change went with an
   * ETag and someone changed the person meanwhile.
   */
  function refusal(error: Error, stale?: string): string {
    if (stale !== undefined && error instanceof Refused && error.stale) return text(stale);
    if (error instanceof Refused && error.is('role_required')) {
      return text('homes.person.not_allowed');
    }
    return text(failureMessage(error));
  }

  // Each failure shows by what failed: the name, the role, or removing.
  const nameFailure =
    update.isError && change?.display_name !== undefined
      ? refusal(update.error, 'homes.person.changed')
      : undefined;
  const roleFailure =
    update.isError && change?.role !== undefined
      ? refusal(update.error, 'homes.person.role.changed')
      : undefined;
  const removeFailure = remove.isError ? refusal(remove.error) : undefined;
  // An admin made a member: the invitations they made are revoked, which the page says.
  const demoted = update.isSuccess && demotes(update.variables.member, update.variables.changes);

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
        <Button
          label={text('homes.person.save')}
          onPress={save}
          busy={renaming}
          disabled={choosing !== undefined}
        />
      )}
      {nameFailure !== undefined && (
        <Text ink="danger" accessibilityRole="alert">
          {nameFailure}
        </Text>
      )}
      {maySetRole(home.role, member) && (
        <View style={styles.role}>
          <ChoiceList
            testID="person-role"
            label={text('homes.person.role')}
            options={roles}
            value={choosing ?? role}
            onChange={choose}
            busy={choosing !== undefined}
            disabled={renaming || remove.isPending}
          />
          {roleFailure !== undefined && (
            <Text ink="danger" accessibilityRole="alert">
              {roleFailure}
            </Text>
          )}
          {demoted && (
            <Text ink="textMuted" aria-live="polite">
              {text('homes.person.role.revoked', { name: member.display_name })}
            </Text>
          )}
        </View>
      )}
      {removeFailure !== undefined && (
        <Text ink="danger" accessibilityRole="alert">
          {removeFailure}
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
  role: { gap: SPACE.sm },
});

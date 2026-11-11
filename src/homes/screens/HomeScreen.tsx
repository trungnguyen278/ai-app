// SPDX-License-Identifier: MIT
import { Link, router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useText } from '@/src/shared/catalog';
import { failureMessage } from '@/src/shared/cloud';
import {
  Appear,
  Button,
  Glow,
  haptic,
  HERO,
  Notice,
  Press,
  RADIUS,
  Screen,
  Skeleton,
  SPACE,
  Text,
  TYPE,
  useTheme,
  VIEW_BLEND,
} from '@/src/shared/design';
import type { App } from '@/src/shared/protocols';

import { hasAccount, roleOf } from '../domain/people';
import { mayManage } from '../domain/permissions';
import { useHomes, useInvitations, useMembers, useRevokeInvitation } from '../services/homes';

/**
 * The home the person is in: `homeId`, or their first. As in Google's Home, the main screen is
 * one home, and the others are a step away. With none yet, a new owner is welcomed.
 */
export function HomeScreen({ homeId }: { homeId?: string }) {
  const text = useText();
  const homes = useHomes();
  if (homes.isPending) {
    return (
      <Screen style={styles.view}>
        <View accessibilityLabel={text('homes.loading')} style={styles.heading}>
          <Skeleton width="70%" height={TYPE.title.lineHeight} radius={RADIUS.sm} />
          <Skeleton width="30%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
        </View>
      </Screen>
    );
  }
  if (homes.isError) {
    return (
      <Screen style={styles.view}>
        <Notice role="alert" ink="danger">
          {text(failureMessage(homes.error))}
        </Notice>
        <Button
          variant="secondary"
          label={text('homes.retry')}
          onPress={() => void homes.refetch()}
        />
      </Screen>
    );
  }
  if (homes.data.length === 0) {
    return <Welcome />;
  }
  const home = homes.data.find((each) => each.id === homeId) ?? homes.data[0];
  return <HomeView home={home} others={homes.data.length > 1} />;
}

/**
 * No home yet: a rare moment, met by a new owner. The robot's light breathes, a welcome arrives
 * under it, and the thing to do is to create a home, or to join one with an invitation.
 */
function Welcome() {
  const text = useText();
  const { color } = useTheme();
  return (
    <Screen style={styles.welcome}>
      <Appear index={0}>
        <View style={styles.light}>
          <Glow testID="home-light" size={HERO} breathing style={StyleSheet.absoluteFill} />
          {/* The light's source, bright at the heart of its halo. */}
          <Animated.View
            aria-hidden
            style={[styles.source, { backgroundColor: color.glow }, VIEW_BLEND]}
          />
        </View>
      </Appear>
      <Appear index={1}>
        <Text variant="display" style={styles.centred}>
          {text('homes.welcome')}
        </Text>
      </Appear>
      <Appear index={2}>
        <Text ink="textMuted" style={styles.centred}>
          {text('homes.empty')}
        </Text>
      </Appear>
      <Appear index={3}>
        <View style={styles.actions}>
          <Button label={text('homes.create')} onPress={() => router.push('/homes/new')} />
          <Button
            variant="secondary"
            label={text('homes.join')}
            onPress={() => router.push('/join')}
          />
        </View>
      </Appear>
    </Screen>
  );
}

/**
 * One home: its name, the person's role in it, and the people in it. Its owner and admins also
 * see the invitations not yet used, and invite people or add profiles.
 */
function HomeView({ home, others }: { home: App.Home; others: boolean }) {
  const text = useText();
  const members = useMembers(home.id);
  const manages = mayManage(home.role);
  return (
    <Screen scroll style={styles.view}>
      <View style={styles.heading}>
        <Text variant="title">{home.name}</Text>
        <Text ink="textMuted">{text(`homes.role.${roleOf(home.role)}`)}</Text>
      </View>
      <View style={styles.section}>
        <Text variant="heading">{text('homes.people')}</Text>
        {members.isPending ? (
          <Skeleton width="50%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
        ) : members.isError ? (
          <Notice role="alert" ink="danger">
            {text(failureMessage(members.error))}
          </Notice>
        ) : (
          <View>
            {members.data.map((member) => (
              <Person key={member.id} homeId={home.id} member={member} />
            ))}
          </View>
        )}
        {manages && (
          <View style={styles.actions}>
            <Button
              variant="secondary"
              label={text('homes.invite')}
              onPress={() => router.push(`/homes/${home.id}/invite`)}
            />
            <Button
              variant="secondary"
              label={text('homes.add_profile')}
              onPress={() => router.push(`/homes/${home.id}/profiles/new`)}
            />
          </View>
        )}
      </View>
      {manages && <Invitations homeId={home.id} />}
      <Button
        variant="secondary"
        label={text(others ? 'homes.switch' : 'homes.more')}
        onPress={() => router.push('/homes')}
      />
    </Screen>
  );
}

/**
 * The invitations not yet used, each with who made it and when it expires, to revoke. Revoking
 * takes no confirmation: a new link is a tap away.
 */
function Invitations({ homeId }: { homeId: string }) {
  const text = useText();
  const invitations = useInvitations(homeId);
  const revoke = useRevokeInvitation(homeId);
  if (invitations.isPending || (invitations.isSuccess && invitations.data.length === 0)) {
    return null;
  }
  return (
    <View style={styles.section}>
      <Text variant="heading">{text('homes.invitations')}</Text>
      {invitations.isError ? (
        <Notice role="alert" ink="danger">
          {text(failureMessage(invitations.error))}
        </Notice>
      ) : (
        invitations.data.map((invitation) => {
          const which = { name: invitation.invited_by, time: new Date(invitation.expire_time) };
          return (
            <View key={invitation.id} style={styles.row}>
              <View style={styles.grow}>
                <Text>{text('homes.invitation.from', which)}</Text>
                <Text variant="caption" ink="textMuted">
                  {text('homes.invitation.expires', which)}
                </Text>
              </View>
              <Button
                variant="plain"
                label={text('homes.invitation.revoke')}
                accessibilityLabel={text('homes.invitation.revoke.which', which)}
                busy={revoke.isPending && revoke.variables === invitation.id}
                onPress={() =>
                  revoke.mutate(invitation.id, {
                    onSuccess: () => haptic('success'),
                    onError: () => haptic('error'),
                  })
                }
              />
            </View>
          );
        })
      )}
      {revoke.isError && (
        <Notice role="alert" ink="danger">
          {text(failureMessage(revoke.error))}
        </Notice>
      )}
    </View>
  );
}

/** A person in the home: their name there, and their role, or that they never sign in. */
function Person({ homeId, member }: { homeId: string; member: App.Member }) {
  const text = useText();
  const name = member.current
    ? text('homes.member.you', { name: member.display_name })
    : member.display_name;
  const what = hasAccount(member.kind)
    ? text(`homes.role.${roleOf(member.role)}`)
    : text('homes.kind.profile');
  return (
    <Link href={`/homes/${homeId}/people/${member.id}`} asChild>
      <Press feedback="light" accessibilityLabel={text('homes.member.row', { name, what })}>
        <View style={styles.person}>
          <Text>{name}</Text>
          <Text variant="caption" ink="textMuted">
            {what}
          </Text>
        </View>
      </Press>
    </Link>
  );
}

const styles = StyleSheet.create({
  welcome: { alignItems: 'center', justifyContent: 'center', gap: SPACE.lg },
  light: { width: HERO, height: HERO, alignItems: 'center', justifyContent: 'center' },
  source: { width: SPACE.xl, height: SPACE.xl, borderRadius: RADIUS.full },
  centred: { textAlign: 'center' },
  view: { gap: SPACE.xxl },
  heading: { gap: SPACE.xs },
  section: { gap: SPACE.md },
  actions: { gap: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  grow: { flex: 1 },
  person: { paddingVertical: SPACE.sm },
});

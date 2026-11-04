// SPDX-License-Identifier: MIT
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useText } from '@/src/shared/catalog';
import { failureMessage } from '@/src/shared/cloud';
import {
  Appear,
  Button,
  Glow,
  HERO,
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
import { useHomes, useMembers } from '../services/homes';

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
        <Text ink="danger" accessibilityRole="alert">
          {text(failureMessage(homes.error))}
        </Text>
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
 * under it, and the one thing to do is to create a home.
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
        <Button label={text('homes.create')} onPress={() => router.push('/homes/new')} />
      </Appear>
    </Screen>
  );
}

/** One home: its name, the person's role in it, and the people in it. */
function HomeView({ home, others }: { home: App.Home; others: boolean }) {
  const text = useText();
  const members = useMembers(home.id);
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
          <Text ink="danger" accessibilityRole="alert">
            {text(failureMessage(members.error))}
          </Text>
        ) : (
          members.data.map((member) => <Person key={member.id} member={member} />)
        )}
      </View>
      <Button
        variant="secondary"
        label={text(others ? 'homes.switch' : 'homes.create')}
        onPress={() => router.push(others ? '/homes' : '/homes/new')}
      />
    </Screen>
  );
}

/** A person in the home: their name there, and their role, or that they never sign in. */
function Person({ member }: { member: App.Member }) {
  const text = useText();
  const name = member.current
    ? text('homes.member.you', { name: member.display_name })
    : member.display_name;
  const what = hasAccount(member.kind)
    ? text(`homes.role.${roleOf(member.role)}`)
    : text('homes.kind.profile');
  return (
    <View>
      <Text>{name}</Text>
      <Text variant="caption" ink="textMuted">
        {what}
      </Text>
    </View>
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
});

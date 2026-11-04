// SPDX-License-Identifier: MIT
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SignInScreen, useSession } from '@/src/account';
import { useText } from '@/src/shared/catalog';
import { failureMessage, Refused } from '@/src/shared/cloud';
import {
  Appear,
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

import { codeIn } from '../domain/links';
import { useAccept, useInvitationPreview } from '../services/homes';

/**
 * Joining a home with an invitation (ai-platform ADR-0009, decision 3): from its link, which
 * opens this screen with the code as its fragment, or from a link or code the person pastes.
 * The person signs in first if they have not, here, so that the link keeps its place; then they
 * see the home and who invited them, and agree, as in Google Home and SmartThings.
 */
export function JoinScreen({ link }: { link?: string }) {
  const text = useText();
  const { state } = useSession();
  const given = link === undefined || link === '' ? undefined : codeIn(link);
  if (state.status !== 'signedIn') {
    return (
      <SignInScreen
        reason={{ title: text('join.signed_out.title'), lead: text('join.signed_out') }}
      />
    );
  }
  return <Join given={given ?? null} broken={given === null} />;
}

/** Back where the person came from, or the main screen when the link opened the app here. */
function leave() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** The code the link gave, or a field for one; then what it invites to. */
function Join({ given, broken }: { given: string | null; broken: boolean }) {
  const [code, setCode] = useState(given);
  if (code === null) {
    return <Paste broken={broken} onCode={setCode} />;
  }
  return <Preview code={code} onAnother={() => setCode(null)} />;
}

/** A field for the link someone sent, or its code alone. */
function Paste({ broken, onCode }: { broken: boolean; onCode: (code: string) => void }) {
  const text = useText();
  const [typed, setTyped] = useState('');
  const [fault, setFault] = useState(broken ? text('join.link.error') : undefined);

  function submit() {
    const code = codeIn(typed);
    if (code === null) {
      haptic('error');
      setFault(text('join.link.error'));
      return;
    }
    onCode(code);
  }

  return (
    <Screen scroll style={styles.page}>
      <Text ink="textMuted">{text('join.lead')}</Text>
      <TextField
        testID="invitation-link"
        label={text('join.link')}
        hint={text('join.link.hint')}
        kind="link"
        value={typed}
        onChangeText={setTyped}
        error={fault}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label={text('join.continue')} onPress={submit} />
    </Screen>
  );
}

/** What the invitation is for, and joining. */
function Preview({ code, onAnother }: { code: string; onAnother: () => void }) {
  const text = useText();
  const preview = useInvitationPreview(code);
  const accept = useAccept();

  if (preview.isPending) {
    return (
      <Screen style={styles.page}>
        <View accessibilityLabel={text('join.loading')} style={styles.page}>
          <Skeleton width="50%" height={TYPE.body.lineHeight} radius={RADIUS.sm} />
          <Skeleton width="70%" height={TYPE.title.lineHeight} radius={RADIUS.sm} />
        </View>
      </Screen>
    );
  }
  if (invalid(preview.error) || invalid(accept.error)) {
    return <Invalid onAnother={onAnother} />;
  }
  if (preview.isError) {
    return (
      <Screen style={styles.page}>
        <Text ink="danger" accessibilityRole="alert">
          {text(failureMessage(preview.error))}
        </Text>
        <Button
          variant="secondary"
          label={text('join.retry')}
          onPress={() => void preview.refetch()}
        />
      </Screen>
    );
  }

  const { home_name: name, invited_by: inviter, expire_time: expires } = preview.data;
  const failure =
    accept.error === null
      ? undefined
      : accept.error instanceof Refused && accept.error.is('home_limit_reached')
        ? text('join.home_limit')
        : accept.error instanceof Refused && accept.error.is('member_limit_reached')
          ? text('join.member_limit')
          : text(failureMessage(accept.error));

  return (
    <Screen scroll style={styles.page}>
      <Appear index={0}>
        <Text ink="textMuted">{text('join.from', { name: inviter })}</Text>
      </Appear>
      <Appear index={1}>
        <Text variant="title">{name}</Text>
      </Appear>
      <Appear index={2}>
        <Text ink="textMuted">{text('join.as_member', { time: new Date(expires) })}</Text>
      </Appear>
      <Appear index={3}>
        <Button
          label={text('join.accept')}
          busy={accept.isPending}
          onPress={() =>
            accept.mutate(code, {
              onSuccess: ({ home }) => {
                haptic('success');
                router.replace(`/homes/${home.id}`);
              },
              onError: () => haptic('error'),
            })
          }
        />
      </Appear>
      <Button variant="plain" label={text('join.not_now')} onPress={leave} />
      {failure !== undefined && (
        <Text ink="danger" accessibilityRole="alert">
          {failure}
        </Text>
      )}
    </Screen>
  );
}

/** Whether the cloud refused the code: unknown, expired, revoked or used by someone else. */
function invalid(error: Error | null): boolean {
  return error instanceof Refused && error.is('invitation_invalid');
}

/** A code that cannot be used, for a reason the cloud does not say (the app API, Joining). */
function Invalid({ onAnother }: { onAnother: () => void }) {
  const text = useText();
  return (
    <Screen scroll style={styles.page}>
      <Text variant="heading">{text('join.invalid.title')}</Text>
      <Text ink="textMuted">{text('join.invalid')}</Text>
      <Button variant="secondary" label={text('join.another')} onPress={onAnother} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.lg },
});

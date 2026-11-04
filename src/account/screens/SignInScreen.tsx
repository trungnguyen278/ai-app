// SPDX-License-Identifier: MIT
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { failureMessage } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import {
  Appear,
  Button,
  Glow,
  haptic,
  HERO,
  Screen,
  SPACE,
  Text,
  TextField,
  type FieldInput,
} from '@/src/shared/design';
import { accepts } from '@/src/shared/protocols';

import { useSession } from '../AccountProvider';
import { developmentProvider } from '../adapters/development';

/**
 * Signing in: the robot's light, what signing in is for, and each provider the configuration
 * offers. A session the cloud ended is said so, before the person signs in again.
 */
export function SignInScreen() {
  const text = useText();
  const { state } = useSession();
  const { providers } = runtimeSettings().sign_in;
  return (
    <Screen scroll style={styles.page}>
      <Appear index={0}>
        <View style={styles.light}>
          <Glow testID="sign-in-light" size={HERO} breathing style={StyleSheet.absoluteFill} />
        </View>
      </Appear>
      <Appear index={1}>
        <Text variant="title" style={styles.centred}>
          {text('sign_in.title')}
        </Text>
      </Appear>
      <Appear index={2}>
        <Text ink="textMuted" style={styles.centred}>
          {text(state.ended ? 'sign_in.ended' : 'sign_in.lead')}
        </Text>
      </Appear>
      {providers.includes('development') && (
        <Appear index={3}>
          <DevelopmentSignIn />
        </Appear>
      )}
    </Screen>
  );
}

/** The development cloud's provider: a test person, by name and email. */
function DevelopmentSignIn() {
  const text = useText();
  const { session, signIn } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [faults, setFaults] = useState<{ name?: string; email?: string }>({});
  const [failure, setFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const emailField = useRef<FieldInput>(null);

  async function submit() {
    const displayName = name.trim();
    const address = email.trim();
    const found = {
      name: accepts('name', displayName) ? undefined : text('sign_in.name.error'),
      email: address === '' || accepts('email', address) ? undefined : text('sign_in.email.error'),
    };
    setFaults(found);
    setFailure(undefined);
    if (found.name !== undefined || found.email !== undefined) {
      haptic('error');
      return;
    }
    setBusy(true);
    try {
      const person = { displayName, email: address === '' ? undefined : address };
      if (await session.signIn(developmentProvider(signIn, person))) haptic('success');
    } catch (error) {
      haptic('error');
      setFailure(text(failureMessage(error)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      <View style={styles.heading}>
        <Text variant="heading">{text('sign_in.development.title')}</Text>
        <Text variant="caption" ink="textMuted">
          {text('sign_in.development.lead')}
        </Text>
      </View>
      <TextField
        testID="sign-in-name"
        label={text('sign_in.name')}
        kind="name"
        value={name}
        onChangeText={setName}
        error={faults.name}
        returnKeyType="next"
        onSubmitEditing={() => emailField.current?.focus()}
        disabled={busy}
      />
      <TextField
        ref={emailField}
        testID="sign-in-email"
        label={text('sign_in.email')}
        hint={text('sign_in.email.hint')}
        kind="email"
        value={email}
        onChangeText={setEmail}
        error={faults.email}
        returnKeyType="go"
        onSubmitEditing={submit}
        disabled={busy}
      />
      <Button label={text('sign_in.submit')} onPress={submit} busy={busy} />
      {failure !== undefined && (
        <Text ink="danger" accessibilityRole="alert" style={styles.centred}>
          {failure}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'stretch', gap: SPACE.lg },
  light: { width: HERO, height: HERO, alignSelf: 'center' },
  centred: { textAlign: 'center' },
  form: { gap: SPACE.lg, marginTop: SPACE.xl },
  heading: { gap: SPACE.xs },
});

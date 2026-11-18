// SPDX-License-Identifier: MIT
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { useCloud } from '@/src/account';
import { useKindNames } from '@/src/devices';
import { mayManage, OneHome } from '@/src/homes';
import { cryptoRandom } from '@/src/shared/bytes';
import { useText } from '@/src/shared/catalog';
import { failureMessage } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import { Button, haptic, Notice, Pulse, Screen, SPACE, Text, TextField } from '@/src/shared/design';
import type { App } from '@/src/shared/protocols';
import { QrScanner } from '@/src/shared/scanner';

import { readDiscriminator, readTypedCode } from '../domain/code';
import { SetupFlow, type SetupStep } from '../services/flow';
import { Added, Moved } from './done';
import { Hidden, Networks, Password } from './networks';
import { useRadio } from './RadioProvider';

/**
 * Adding a device to a home, for its owner and admins (ADR-0013 of ai-platform): a short
 * explanation, Bluetooth, the device's code, its Wi-Fi network, its name, and then the device,
 * once it is online. Leaving the screen ends the session, and the device stays in set-up.
 */
export function SetupScreen({ homeId }: { homeId: string }) {
  const text = useText();
  return (
    <OneHome homeId={homeId}>
      {(home) =>
        mayManage(home.role) ? (
          <Setup home={home} />
        ) : (
          <Screen style={styles.page}>
            <Text ink="textMuted">{text('setup.not_allowed')}</Text>
          </Screen>
        )
      }
    </OneHome>
  );
}

function Setup({ home }: { home: App.Home }) {
  const radio = useRadio();
  const cloud = useCloud();
  const kindName = useKindNames();
  const [flow] = useState(
    () =>
      new SetupFlow({
        radio,
        cloud,
        home,
        session: { random: cryptoRandom, settings: runtimeSettings().setup },
        kindName,
      }),
  );
  useEffect(() => () => void flow.close(), [flow]);
  const step = useSyncExternalStore(flow.subscribe, flow.current);
  return <Step flow={flow} home={home} step={step} />;
}

function Step({ flow, home, step }: { flow: SetupFlow; home: App.Home; step: SetupStep }) {
  switch (step.step) {
    case 'intro':
      return <Intro flow={flow} home={home} />;
    case 'radio':
      return <Radio flow={flow} state={step.state} />;
    case 'code':
      return <Code flow={flow} />;
    case 'discriminator':
      return <Discriminator flow={flow} />;
    case 'working':
      return <Working work={step.work} />;
    case 'networks':
      return <Networks flow={flow} networks={step.networks} fault={step.fault} />;
    case 'password':
      return <Password flow={flow} network={step.network} fault={step.fault} />;
    case 'hidden':
      return <Hidden flow={flow} fault={step.fault} last={step.last} />;
    case 'added':
      return <Added home={home} device={step.device} added={step.added} />;
    case 'moved':
      return <Moved homeId={step.homeId} deviceId={step.deviceId} network={step.network} />;
    case 'failed':
      return <Failed flow={flow} homeId={home.id} step={step} />;
  }
}

/**
 * What set-up needs, before the phone asks for anything. Apple's guidelines (Privacy, Pre-alert
 * screens) ask for a single button, named "Continue" or "Next", that opens the system's request;
 * Android's (Request runtime permissions, Explain why your app needs the permission) ask for the
 * reason first. Both read 2026-11-16.
 */
function Intro({ flow, home }: { flow: SetupFlow; home: App.Home }) {
  const text = useText();
  return (
    <Screen scroll style={styles.page}>
      <Text variant="title">{text('setup.intro.title', { home: home.name })}</Text>
      <Text>{text('setup.intro.lead')}</Text>
      <Text ink="textMuted">{text('setup.intro.bluetooth')}</Text>
      <Button label={text('setup.continue')} onPress={() => void flow.begin()} />
    </Screen>
  );
}

/** Bluetooth cannot be used: why, and the way to the settings. Its state is read again whenever
 * the app comes back to the front, as the person may have changed it there. */
function Radio({
  flow,
  state,
}: {
  flow: SetupFlow;
  state: Extract<SetupStep, { step: 'radio' }>['state'];
}) {
  const text = useText();
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void flow.recheck();
    });
    return () => subscription.remove();
  }, [flow]);
  return (
    <Screen scroll style={styles.page}>
      <Notice role="alert" ink="danger">
        {text(`setup.radio.${state}`)}
      </Notice>
      {state === 'blocked' && (
        <Button
          variant="secondary"
          label={text('setup.radio.settings')}
          onPress={() => void Linking.openSettings()}
        />
      )}
      {state === 'off' && (
        <Button
          variant="secondary"
          label={text('setup.retry')}
          onPress={() => void flow.recheck()}
        />
      )}
    </Screen>
  );
}

/** The device's QR code, read with the camera, or its 8 digits, typed. */
function Code({ flow }: { flow: SetupFlow }) {
  const text = useText();
  const [typing, setTyping] = useState(false);
  if (typing) {
    return <TypedCode flow={flow} onScan={() => setTyping(false)} />;
  }
  return (
    <Screen scroll style={styles.page}>
      <QrScanner
        reason={text('setup.code.reason')}
        refused={text('setup.code.refused')}
        onRead={(data) => flow.scanned(data)}
      />
      <Button variant="plain" label={text('setup.code.type')} onPress={() => setTyping(true)} />
    </Screen>
  );
}

function TypedCode({ flow, onScan }: { flow: SetupFlow; onScan: () => void }) {
  const text = useText();
  const [typed, setTyped] = useState('');
  const [fault, setFault] = useState<string>();

  function submit() {
    const code = readTypedCode(typed);
    if (code === null) {
      haptic('error');
      setFault(text('setup.code.error'));
      return;
    }
    void flow.typed(code);
  }

  return (
    <Screen scroll style={styles.page}>
      <TextField
        testID="setup-code"
        label={text('setup.code')}
        hint={text('setup.code.hint')}
        kind="digits"
        value={typed}
        onChangeText={setTyped}
        error={fault}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label={text('setup.continue')} onPress={submit} />
      <Button variant="plain" label={text('setup.code.scan')} onPress={onScan} />
    </Screen>
  );
}

/** The 4 characters beside the code: a typed code is tried only on the device that shows them. */
function Discriminator({ flow }: { flow: SetupFlow }) {
  const text = useText();
  const [typed, setTyped] = useState('');
  const [fault, setFault] = useState<string>();

  function submit() {
    const discriminator = readDiscriminator(typed);
    if (discriminator === null) {
      haptic('error');
      setFault(text('setup.discriminator.error'));
      return;
    }
    void flow.discriminator(discriminator);
  }

  return (
    <Screen scroll style={styles.page}>
      <Text>{text('setup.discriminator.lead')}</Text>
      <TextField
        testID="setup-discriminator"
        label={text('setup.discriminator')}
        hint={text('setup.discriminator.hint')}
        kind="verbatim"
        value={typed}
        onChangeText={setTyped}
        error={fault}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label={text('setup.continue')} onPress={submit} />
      <Button variant="plain" label={text('setup.code.scan')} onPress={() => flow.toCode()} />
    </Screen>
  );
}

/** What the app does while the person waits, said as it changes. */
function Working({ work }: { work: Extract<SetupStep, { step: 'working' }>['work'] }) {
  const text = useText();
  return (
    <Screen style={styles.page}>
      <View style={styles.waiting}>
        <Pulse />
        <Notice role="status">{text(`setup.working.${work}`)}</Notice>
      </View>
    </Screen>
  );
}

/** What ended set-up, each failure in its own words (ADR-0013, decision 7), and the way on. */
function Failed({
  flow,
  homeId,
  step,
}: {
  flow: SetupFlow;
  homeId: string;
  step: Extract<SetupStep, { step: 'failed' }>;
}) {
  const text = useText();
  const message =
    step.failure === 'cloud'
      ? text(failureMessage(step.error))
      : text(`setup.failed.${step.failure}`);
  return (
    <Screen scroll style={styles.page}>
      <Notice role="alert" ink="danger">
        {message}
      </Notice>
      {step.retry ? (
        <Button label={text('setup.retry')} onPress={() => void flow.retry()} />
      ) : (
        <Button variant="secondary" label={text('setup.close')} onPress={() => leave(homeId)} />
      )}
    </Screen>
  );
}

/** Leaves set-up for the page below it, or for the home when a link opened it with nothing below. */
function leave(homeId: string) {
  if (router.canGoBack()) router.back();
  else router.replace(`/homes/${homeId}`);
}

const styles = StyleSheet.create({
  page: { gap: SPACE.md },
  waiting: { gap: SPACE.md, alignItems: 'center', paddingVertical: SPACE.xl },
});

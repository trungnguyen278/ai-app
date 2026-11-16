// SPDX-License-Identifier: MIT
// The device's Wi-Fi network: one it sees, its password, or one that hides its name.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import {
  Button,
  ChoiceList,
  haptic,
  Notice,
  Press,
  Screen,
  SPACE,
  Text,
  TextField,
} from '@/src/shared/design';

import { fitsPassword, fitsSsid, shownSsid, type Secured } from '../domain/wifi';
import type { HiddenNetwork, JoinFault, SetupFlow } from '../services/flow';
import type { Network } from '../services/session';

/** What a network refused, in words: a name not found has its own for a hidden network. */
function JoinFaultNotice({ fault, hidden = false }: { fault?: JoinFault; hidden?: boolean }) {
  const text = useText();
  if (fault === undefined) {
    return null;
  }
  return (
    <Notice role="alert" ink="danger">
      {text(hidden && fault === 'not_found' ? 'setup.hidden.not_found' : `setup.join.${fault}`)}
    </Notice>
  );
}

/**
 * The networks the device sees, in its order, then "Other network…" last, for one that hides its
 * name, as Google's Home app ends its list in set-up ("Other": Google Nest Help, answers 7212115
 * and 9249264, read 2026-11-13).
 */
export function Networks({
  flow,
  networks,
  fault,
}: {
  flow: SetupFlow;
  networks: Network[];
  fault?: JoinFault;
}) {
  const text = useText();
  return (
    <Screen scroll style={styles.page}>
      <Text variant="heading">{text('setup.networks.title')}</Text>
      <JoinFaultNotice fault={fault} />
      {networks.length === 0 && <Text ink="textMuted">{text('setup.networks.empty')}</Text>}
      <View>
        {networks.map((network, index) => (
          <NetworkRow
            // A list's names may repeat, one for each band or access point.
            key={index}
            network={network}
            onPress={() => void flow.choose(network)}
          />
        ))}
        <Press
          feedback="light"
          accessibilityRole="button"
          onPress={() => flow.other()}
          style={styles.row}
        >
          <Text>{text('setup.networks.other')}</Text>
        </Press>
      </View>
      <Button
        variant="secondary"
        label={text('setup.networks.rescan')}
        onPress={() => void flow.rescan()}
      />
    </Screen>
  );
}

/** A network: its name, and whether it is open, secured or saved. One whose security set-up
 * cannot use, such as WPA2 Enterprise, is shown, and cannot be chosen. */
function NetworkRow({ network, onPress }: { network: Network; onPress: () => void }) {
  const text = useText();
  const name = shownSsid(network);
  const usable = network.security !== 'other';
  const status = text(
    !usable
      ? 'setup.network.unsupported'
      : network.saved
        ? 'setup.network.saved'
        : network.security === 'open'
          ? 'setup.network.open'
          : 'setup.network.secured',
  );
  return (
    <Press
      feedback="light"
      accessibilityRole="button"
      accessibilityLabel={text('setup.network.row', { name, status })}
      accessibilityState={{ disabled: !usable }}
      disabled={!usable}
      onPress={onPress}
      style={styles.row}
    >
      <Text ink={usable ? 'text' : 'textMuted'}>{name}</Text>
      <Text variant="caption" ink="textMuted">
        {status}
      </Text>
    </Press>
  );
}

/** A password, hidden as it is typed unless the person shows it, as Material's password toggle
 * lets them (TextInputLayout's END_ICON_PASSWORD_TOGGLE, read 2026-11-16). */
function PasswordField({
  value,
  onChange,
  fault,
  onSubmit,
}: {
  value: string;
  onChange: (text: string) => void;
  fault?: string;
  onSubmit: () => void;
}) {
  const text = useText();
  const [shown, setShown] = useState(false);
  return (
    <>
      <TextField
        testID="setup-password"
        label={text('setup.password')}
        kind={shown ? 'verbatim' : 'password'}
        value={value}
        onChangeText={onChange}
        error={fault}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
      />
      <Button
        variant="plain"
        label={text(shown ? 'setup.password.hide' : 'setup.password.show')}
        onPress={() => setShown(!shown)}
      />
    </>
  );
}

/** What is wrong with `password` for a network of `security`, or nothing. */
function passwordFault(
  text: ReturnType<typeof useText>,
  security: Secured,
  password: string,
): string | undefined {
  return fitsPassword(security, password) ? undefined : text(`setup.password.error.${security}`);
}

/** The password of a network listed. */
export function Password({
  flow,
  network,
  fault,
}: {
  flow: SetupFlow;
  network: Network;
  fault?: JoinFault;
}) {
  const text = useText();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const security = network.security as Secured;

  function submit() {
    const wrong = passwordFault(text, security, password);
    setError(wrong);
    if (wrong !== undefined) {
      haptic('error');
      return;
    }
    void flow.password(network, password);
  }

  return (
    <Screen scroll style={styles.page}>
      <Text variant="heading">{text('setup.password.title', { name: shownSsid(network) })}</Text>
      <JoinFaultNotice fault={fault} />
      <PasswordField value={password} onChange={setPassword} fault={error} onSubmit={submit} />
      <Button label={text('setup.join')} onPress={submit} />
      <Button
        variant="plain"
        label={text('setup.networks.back')}
        onPress={() => flow.toNetworks()}
      />
    </Screen>
  );
}

const SECURITIES = ['open', 'wpa2', 'wpa3'] as const;

/**
 * A network that hides its name: its name, its security and its password, as Google's Home app
 * asks for one ("Other", answer 7212115). The device then probes for it by its name, which it
 * sends on the air.
 */
export function Hidden({
  flow,
  fault,
  last,
}: {
  flow: SetupFlow;
  fault?: JoinFault;
  last?: HiddenNetwork;
}) {
  const text = useText();
  const [name, setName] = useState(last?.ssid ?? '');
  const [security, setSecurity] = useState<HiddenNetwork['security']>(last?.security ?? 'wpa2');
  const [password, setPassword] = useState('');
  const [nameError, setNameError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();

  function submit() {
    const wrongName = fitsSsid(name) ? undefined : text('setup.hidden.name.error');
    const wrongPassword = security === 'open' ? undefined : passwordFault(text, security, password);
    setNameError(wrongName);
    setPasswordError(wrongPassword);
    if (wrongName !== undefined || wrongPassword !== undefined) {
      haptic('error');
      return;
    }
    void flow.hidden({ ssid: name, security }, security === 'open' ? undefined : password);
  }

  return (
    <Screen scroll style={styles.page}>
      <Text variant="heading">{text('setup.hidden.title')}</Text>
      <Text ink="textMuted">{text('setup.hidden.lead')}</Text>
      <JoinFaultNotice fault={fault} hidden />
      <TextField
        testID="setup-hidden-name"
        label={text('setup.hidden.name')}
        hint={text('setup.hidden.name.hint')}
        kind="verbatim"
        value={name}
        onChangeText={setName}
        error={nameError}
        returnKeyType="next"
      />
      <ChoiceList
        testID="setup-hidden-security"
        label={text('setup.hidden.security')}
        options={SECURITIES.map((value) => ({
          value,
          label: text(`setup.hidden.security.${value}`),
        }))}
        value={security}
        onChange={setSecurity}
      />
      {security !== 'open' && (
        <PasswordField
          value={password}
          onChange={setPassword}
          fault={passwordError}
          onSubmit={submit}
        />
      )}
      <Button label={text('setup.join')} onPress={submit} />
      <Button
        variant="plain"
        label={text('setup.networks.back')}
        onPress={() => flow.toNetworks()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.md },
  row: { paddingVertical: SPACE.sm },
});

// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import {
  Button,
  ChoiceList,
  CODE_SIZE,
  Notice,
  Press,
  QrCode,
  Screen,
  SPACE,
  Text,
  TextField,
} from '@/src/shared/design';

import { Row, Section } from './parts';

const SPEAKING = ['asked', 'news', 'never'] as const;
type Speaking = (typeof SPEAKING)[number];

/**
 * The components, to press and feel: buttons of every weight and state, rows, fields, choices,
 * which the button that starts and stops waiting makes busy too, notices for screen readers to
 * say, and a QR code, for another phone to read.
 */
export function ComponentsScreen() {
  const text = useText();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('linh@');
  const [speaks, setSpeaks] = useState<Speaking>('asked');
  // A failure that says one thing, then another; and news.
  const [failure, setFailure] = useState<'first' | 'second'>();
  const [news, setNews] = useState(false);
  const nothing = () => {};
  const speaking = SPEAKING.map((value) => ({
    value,
    label: text(`studio.components.choice.${value}`),
    detail: text(`studio.components.choice.${value}.detail`),
  }));
  return (
    <Screen scroll>
      <Section title={text('studio.components.buttons')}>
        <View style={styles.buttons}>
          <Button label={text('studio.components.primary')} onPress={nothing} />
          <Button
            variant="secondary"
            label={text('studio.components.secondary')}
            onPress={nothing}
          />
          <Button variant="plain" label={text('studio.components.plain')} onPress={nothing} />
          <Button variant="danger" label={text('studio.components.danger')} onPress={nothing} />
          <Button label={text('studio.components.disabled')} onPress={nothing} disabled />
          <Button label={text('studio.components.busy')} onPress={nothing} busy={busy} />
          <Button
            variant="secondary"
            label={text('studio.components.toggle')}
            onPress={() => setBusy((now) => !now)}
          />
        </View>
      </Section>
      <Section title={text('studio.components.rows')}>
        {[1, 2, 3].map((number) => (
          <Press key={number} feedback="light" onPress={nothing}>
            <Row>
              <Text>{text('studio.components.row')}</Text>
            </Row>
          </Press>
        ))}
      </Section>
      <Section title={text('studio.components.fields')}>
        <View style={styles.fields}>
          <TextField
            label={text('studio.components.name')}
            hint={text('studio.components.hint')}
            kind="name"
            value={name}
            onChangeText={setName}
          />
          <TextField
            label={text('studio.components.email')}
            kind="email"
            value={email}
            onChangeText={setEmail}
            error={email.includes('.') ? undefined : text('studio.components.error')}
          />
          <TextField
            label={text('studio.components.disabled')}
            value={text('studio.components.row')}
            onChangeText={nothing}
            disabled
          />
        </View>
      </Section>
      {/* Choices sit on the canvas, as on a page: their options are a surface of their own. */}
      <View style={styles.choices}>
        <ChoiceList
          label={text('studio.components.choice')}
          options={speaking}
          value={speaks}
          onChange={setSpeaks}
          busy={busy}
        />
        <ChoiceList
          label={text('studio.components.disabled')}
          options={speaking}
          value={speaks}
          onChange={nothing}
          disabled
        />
      </View>
      <Section title={text('studio.components.notices')}>
        <View style={styles.buttons}>
          <Button
            variant="secondary"
            label={text('studio.components.notice.fail')}
            onPress={() => setFailure((now) => (now === 'first' ? 'second' : 'first'))}
          />
          <Button
            variant="secondary"
            label={text('studio.components.notice.tell')}
            onPress={() => setNews(true)}
          />
          <Button
            variant="secondary"
            label={text('studio.components.notice.both')}
            onPress={() => {
              setFailure('first');
              setNews(true);
            }}
          />
          <Button
            variant="plain"
            label={text('studio.components.notice.clear')}
            onPress={() => {
              setFailure(undefined);
              setNews(false);
            }}
          />
          {failure !== undefined && (
            <Notice role="alert" ink="danger">
              {text(`studio.components.notice.alert.${failure}`)}
            </Notice>
          )}
          {news && (
            <Notice role="status" ink="textMuted">
              {text('studio.components.notice.status')}
            </Notice>
          )}
        </View>
      </Section>
      <Section title={text('studio.components.code')}>
        <View style={styles.code}>
          <QrCode
            value={SAMPLE_LINK}
            size={CODE_SIZE}
            accessibilityLabel={text('studio.components.code.label')}
          />
        </View>
      </Section>
    </Screen>
  );
}

// An invitation's link, as long as a real one, to a cloud and with a code that do not exist.
const SAMPLE_LINK = 'https://cloud.example/join#AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const styles = StyleSheet.create({
  buttons: { gap: SPACE.md, padding: SPACE.lg },
  fields: { gap: SPACE.lg, padding: SPACE.lg },
  choices: { gap: SPACE.lg },
  code: { alignItems: 'center', padding: SPACE.lg },
});

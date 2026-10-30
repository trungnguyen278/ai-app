// SPDX-License-Identifier: MIT
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { Button, Press, Screen, SPACE, Text } from '@/src/shared/design';

import { Row, Section } from './parts';

/** The components, to press and feel: buttons of every weight and state, and rows. */
export function ComponentsScreen() {
  const text = useText();
  const [busy, setBusy] = useState(false);
  const nothing = () => {};
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: SPACE.md, padding: SPACE.lg },
});

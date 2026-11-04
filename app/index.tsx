// SPDX-License-Identifier: MIT
import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AccountButton } from '@/src/account';
import { HomeScreen } from '@/src/homes';
import { useText } from '@/src/shared/catalog';
import { runtimeSettings } from '@/src/shared/config';
import { SPACE } from '@/src/shared/design';
import { StudioLink } from '@/src/studio';

/**
 * The first screen once signed in: the owner's homes. Its header leads to the account, and, in
 * the development app, to the studio.
 */
export default function Index() {
  const text = useText();
  const studio = runtimeSettings().studio;
  return (
    <>
      <Stack.Screen
        options={{
          title: text('homes.title'),
          headerRight: () => (
            <View style={styles.header}>
              {studio && <StudioLink />}
              <AccountButton />
            </View>
          ),
        }}
      />
      <HomeScreen />
    </>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
});

// SPDX-License-Identifier: MIT
import { router } from 'expo-router';
import { Share, StyleSheet, View } from 'react-native';

import { usePlainText, useText } from '@/src/shared/catalog';
import { failureMessage, Refused, type NewInvitation } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import {
  Appear,
  Button,
  CODE_SIZE,
  haptic,
  QrCode,
  Screen,
  SPACE,
  Text,
} from '@/src/shared/design';
import type { App } from '@/src/shared/protocols';

import { invitationLink } from '../domain/links';
import { useInvite } from '../services/homes';
import { OneHome } from './OneHome';

/**
 * Inviting someone to a home with a link that works once, as Tuya's codes and Telegram's links
 * do (ai-platform ADR-0009, decision 3). The link is made when the person asks for it, and
 * shown only here: the cloud keeps its hash, and cannot show it again.
 */
export function InviteScreen({ homeId }: { homeId: string }) {
  return <OneHome homeId={homeId}>{(home) => <Invite home={home} />}</OneHome>;
}

function Invite({ home }: { home: App.Home }) {
  const text = useText();
  const invite = useInvite(home.id);
  if (invite.data !== undefined) {
    return <Made home={home} invitation={invite.data} />;
  }
  const failure =
    invite.error === null
      ? undefined
      : invite.error instanceof Refused && invite.error.is('invitation_limit_reached')
        ? text('homes.invite.limit')
        : text(failureMessage(invite.error));
  return (
    <Screen scroll style={styles.page}>
      <Text>{text('homes.invite.lead', { home: home.name })}</Text>
      <Text ink="textMuted">{text('homes.invite.caution')}</Text>
      <Button
        label={text('homes.invite.make')}
        busy={invite.isPending}
        onPress={() =>
          invite.mutate(undefined, {
            onSuccess: () => haptic('success'),
            onError: () => haptic('error'),
          })
        }
      />
      {failure !== undefined && (
        <Text ink="danger" accessibilityRole="alert">
          {failure}
        </Text>
      )}
    </Screen>
  );
}

/**
 * The link just made: as a QR code, for the person to scan with the app, as SmartThings and
 * Telegram offer; or to share through the phone's own sheet, or copy from the screen.
 */
function Made({ home, invitation }: { home: App.Home; invitation: NewInvitation }) {
  const text = useText();
  // The message leaves the app, so it carries no invisible marks.
  const plain = usePlainText();
  const link = invitationLink(runtimeSettings().cloud.address, invitation.code);

  async function share() {
    try {
      await Share.share({ message: plain('homes.invite.message', { home: home.name, link }) });
    } catch {
      // The phone could not open its sheet: the link stays on the screen, to copy.
    }
  }

  return (
    <Screen scroll style={styles.page}>
      <Appear index={0}>
        <Text variant="heading">{text('homes.invite.ready')}</Text>
      </Appear>
      <Appear index={1}>
        <View style={styles.code}>
          <QrCode
            testID="invitation-code"
            value={link}
            size={CODE_SIZE}
            accessibilityLabel={text('homes.invite.code')}
          />
          <Text ink="textMuted" style={styles.centred}>
            {text('homes.invite.scan')}
          </Text>
        </View>
      </Appear>
      <Appear index={2}>
        <Text ink="textMuted">
          {text('homes.invite.expires', { time: new Date(invitation.expire_time) })}
        </Text>
      </Appear>
      <Appear index={3}>
        <Button label={text('homes.invite.share')} onPress={() => void share()} />
      </Appear>
      <Text variant="caption" ink="textMuted" selectable testID="invitation-link">
        {link}
      </Text>
      <Text variant="caption" ink="textMuted">
        {text('homes.invite.once')}
      </Text>
      <Button variant="secondary" label={text('homes.invite.done')} onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: SPACE.lg },
  code: { alignItems: 'center', gap: SPACE.md },
  centred: { textAlign: 'center' },
});

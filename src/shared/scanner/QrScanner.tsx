// SPDX-License-Identifier: MIT
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';

import { useText } from '@/src/shared/catalog';
import { Button, haptic, RADIUS, SPACE, Text } from '@/src/shared/design';

export interface QrScannerProps {
  /** Why the app needs the camera, said before the phone asks: what it is about to read. */
  reason: string;
  /** Takes what a code holds, and says whether the screen can use it. */
  onRead: (data: string) => boolean;
  /** What is said of a code the screen cannot use, while the camera reads on. */
  refused: string;
}

/**
 * Reading a QR code with the camera, as Android's and Apple's guidance asks of a permission: the
 * reason first, then the phone's own question; once the person has said no for good, the way to
 * the phone's settings. The camera looks for QR codes alone, and stops at the first one taken.
 */
export function QrScanner({ reason, onRead, refused }: QrScannerProps) {
  const text = useText();
  const [permission, ask, check] = useCameraPermissions();
  // A person sent to the settings turns the camera on there, and comes back: Expo's hook reads
  // the permission only as it starts, so it is read again whenever the app comes to the front.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void check();
    });
    return () => subscription.remove();
  }, [check]);
  // The camera reports a code in every frame it sees it: one is taken, and one refused is not
  // refused again.
  const taken = useRef(false);
  const [refusal, setRefusal] = useState<string>();

  if (permission === null) {
    return null;
  }
  if (!permission.granted) {
    return (
      <View style={styles.part}>
        <Text ink="textMuted">{reason}</Text>
        {permission.canAskAgain ? (
          <Button label={text('scanner.allow')} onPress={() => void ask()} />
        ) : (
          <>
            <Text ink="textMuted">{text('scanner.denied')}</Text>
            <Button
              variant="secondary"
              label={text('scanner.settings')}
              onPress={() => void Linking.openSettings()}
            />
          </>
        )}
      </View>
    );
  }

  function read({ data }: BarcodeScanningResult) {
    if (taken.current || data === refusal) return;
    if (onRead(data)) {
      taken.current = true;
      haptic('success');
    } else {
      haptic('error');
      setRefusal(data);
    }
  }

  return (
    <View style={styles.part}>
      <View style={styles.window}>
        <CameraView
          testID="qr-camera"
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={read}
        />
      </View>
      <Text ink={refusal === undefined ? 'textMuted' : 'danger'} aria-live="polite">
        {refusal === undefined ? text('scanner.aim') : refused}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  part: { gap: SPACE.lg },
  // The camera's view does not clip its own corners on every platform: its frame does.
  window: { aspectRatio: 1, borderRadius: RADIUS.lg, overflow: 'hidden' },
  camera: { flex: 1 },
});

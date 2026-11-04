// SPDX-License-Identifier: MIT
// expo-camera, as the tests see it: the camera's permission is what a test sets, and asking for it
// gets the answer the test chose; the camera's view sees the codes a test shows it.
import { useCallback, useEffect, useState } from 'react';
import { View, type ViewProps } from 'react-native';

export interface Permission {
  granted: boolean;
  canAskAgain: boolean;
}

interface Scan {
  type: string;
  data: string;
}

export const camera = {
  /** The permission as the phone has it before anyone asks; `null` while it is read. */
  permission: null as Permission | null,
  /** What the phone answers when the app asks. */
  answer: { granted: true, canAskAgain: true } as Permission,
  /** How many times the app asked. */
  asked: 0,
  /** What the camera's view reports a code to, while one is shown. */
  report: undefined as ((scan: Scan) => void) | undefined,
};

/** Puts the camera as it is before a test. */
export function resetCamera(permission: Permission | null) {
  camera.permission = permission;
  camera.answer = { granted: true, canAskAgain: true };
  camera.asked = 0;
  camera.report = undefined;
}

/** As Expo's hook: the permission, asking for it, and reading it again, which keep their identity. */
export function useCameraPermissions() {
  const [permission, setPermission] = useState(camera.permission);
  const ask = useCallback(async () => {
    camera.asked += 1;
    camera.permission = camera.answer;
    setPermission(camera.answer);
    return camera.answer;
  }, []);
  const check = useCallback(async () => {
    setPermission(camera.permission);
    return camera.permission;
  }, []);
  return [permission, ask, check] as const;
}

export function CameraView({
  onBarcodeScanned,
  ...props
}: ViewProps & { onBarcodeScanned?: (scan: Scan) => void }) {
  useEffect(() => {
    camera.report = onBarcodeScanned;
    return () => {
      camera.report = undefined;
    };
  });
  return <View {...props} />;
}

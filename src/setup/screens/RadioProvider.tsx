// SPDX-License-Identifier: MIT
import { createContext, useContext, type ReactNode } from 'react';

import type { Radio } from '../ports/radio';

const RadioContext = createContext<Radio | null>(null);

/** The radio that set-up finds devices with, for every screen under it: the app's root gives the
 * one its configuration names (`radioFor`), and a test its own. */
export function RadioProvider({ radio, children }: { radio: Radio; children: ReactNode }) {
  return <RadioContext value={radio}>{children}</RadioContext>;
}

/** The radio of the `RadioProvider` above. */
export function useRadio(): Radio {
  const radio = useContext(RadioContext);
  if (radio === null) {
    throw new Error('useRadio needs a RadioProvider above it');
  }
  return radio;
}

// SPDX-License-Identifier: MIT
// Renders a screen as the app does: with a catalog, the design system and the phone's safe area.
import { render } from '@testing-library/react-native';
import { useEffect, type ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Catalog, CatalogProvider, CATALOGS } from '@/src/shared/catalog';
import { DesignProvider, useDesign, type Design } from '@/src/shared/design';

// A phone's screen, with bars at the top and the bottom.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const seen: { design?: Design } = {};

// Hands the design's state, as the screen sees it, to the test.
function DesignProbe() {
  const design = useDesign();
  useEffect(() => {
    seen.design = design;
  });
  return null;
}

export function renderScreen(screen: ReactElement, languages: string[] = ['en']) {
  seen.design = undefined;
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <CatalogProvider catalog={new Catalog(CATALOGS, languages, () => {})}>
        <DesignProvider>
          {screen}
          <DesignProbe />
        </DesignProvider>
      </CatalogProvider>
    </SafeAreaProvider>,
  );
}

/** The design's state, with what changes it, as the screen rendered last saw it. */
export function design(): Design {
  if (seen.design === undefined) {
    throw new Error('nothing was rendered with renderScreen');
  }
  return seen.design;
}

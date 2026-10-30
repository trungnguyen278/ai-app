// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from '@/src/homes';
import { Catalog, CatalogProvider, CATALOGS } from '@/src/shared/catalog';

test.each([
  [['vi', 'en'], 'Bạn chưa có nhà nào.'],
  [['en'], 'You have no home yet.'],
])('in %j, it says there is no home yet', async (languages, text) => {
  await render(
    <CatalogProvider catalog={new Catalog(CATALOGS, languages, () => {})}>
      <HomeScreen />
    </CatalogProvider>,
  );
  expect(screen.getByText(text)).toBeOnTheScreen();
});

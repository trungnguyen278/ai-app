// SPDX-License-Identifier: MIT
import { phoneCatalog } from '@/src/shared/catalog';

// Jest lets a mock's factory reach only variables named mock….
const mockLocales = jest.fn();
jest.mock('expo-localization', () => ({ getLocales: () => mockLocales() }));

test.each([
  [['vi-VN', 'en-US'], ['vi', 'en'], 'Nhà của bạn'],
  [['fr-FR'], ['en'], 'Your homes'],
])("follows the phone's languages %j", (tags, languages, text) => {
  mockLocales.mockReturnValue(tags.map((languageTag) => ({ languageTag })));
  const catalog = phoneCatalog();
  expect(catalog.languages).toEqual(languages);
  expect(catalog.text('homes.title')).toBe(text);
});

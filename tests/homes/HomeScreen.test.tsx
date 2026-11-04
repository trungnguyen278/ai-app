// SPDX-License-Identifier: MIT
// The homes' screens, on the simulated cloud: the welcome of a new owner, one home and its
// people, and a new home made from the phone's time zone and languages.
import { fireEvent, screen } from '@testing-library/react-native';
import { withRepeat } from 'react-native-reanimated';

import { CreateHomeScreen, HomeScreen } from '@/src/homes';
import { runtimeSettings } from '@/src/shared/config';

import { Account, signedIn } from '../account/render';
import { renderScreen } from '../render';

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, withRepeat: jest.fn(actual.withRepeat) };
});

// The phone: in Vietnam, in Vietnamese, then English.
jest.mock('expo-localization', () => ({
  ...jest.requireActual('expo-localization'),
  getCalendars: () => [{ timeZone: 'Asia/Ho_Chi_Minh' }],
  getLocales: () => [{ languageTag: 'vi-VN' }, { languageTag: 'en-US' }, { languageTag: 'vi-VN' }],
}));

const HOME = { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi'] };

test.each([
  [['vi', 'en'], 'Chào mừng bạn', 'Tạo một nhà'],
  [['en'], 'Welcome', 'Create a home'],
])(
  'in %j, a new owner with no home is welcomed, and offered to make one',
  async (languages, welcome, create) => {
    const { cloud, secrets } = await signedIn();
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <HomeScreen />
      </Account>,
      languages,
    );
    expect(await screen.findByRole('header', { name: welcome })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: create })).toBeOnTheScreen();
  },
);

test("the robot's light breathes, for the eyes only", async () => {
  const { cloud, secrets } = await signedIn();
  await renderScreen(
    <Account transport={cloud} secrets={secrets}>
      <HomeScreen />
    </Account>,
  );
  await screen.findByRole('header', { name: 'Welcome' });
  expect(screen.getByTestId('home-light', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.queryByTestId('home-light')).toBeNull();
  expect(withRepeat).toHaveBeenCalled();
});

test("a home shows its name, the person's role, and its people", async () => {
  const { cloud, secrets, api } = await signedIn('Linh');
  const home = await api.createHome(HOME);
  await api.addProfile(home.id, 'Bà');
  await renderScreen(
    <Account transport={cloud} secrets={secrets}>
      <HomeScreen homeId={home.id} />
    </Account>,
  );
  expect(await screen.findByRole('header', { name: 'Nhà Linh' })).toBeOnTheScreen();
  // MF2 isolates the name within the text, as it does every value.
  expect(await screen.findByText('\u2068Linh\u2069 (you)')).toBeOnTheScreen();
  expect(screen.getAllByText('Owner')).toHaveLength(2);
  expect(screen.getByText('Bà')).toBeOnTheScreen();
  expect(screen.getByText('A profile, who does not sign in')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Create a home' })).toBeOnTheScreen();
});

test('with more than one home, the main screen leads to the others', async () => {
  const { cloud, secrets, api } = await signedIn('Linh');
  await api.createHome(HOME);
  await api.createHome({ ...HOME, name: 'Nhà quê' });
  await renderScreen(
    <Account transport={cloud} secrets={secrets}>
      <HomeScreen />
    </Account>,
  );
  expect(await screen.findByRole('header', { name: 'Nhà Linh' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Your other homes' })).toBeOnTheScreen();
});

describe('a new home', () => {
  test("starts as the person's own home, with the phone's time zone and languages", async () => {
    const { cloud, secrets } = await signedIn('Linh');
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <CreateHomeScreen />
      </Account>,
    );
    expect(await screen.findByDisplayValue("Linh's home")).toBeOnTheScreen();
    expect(screen.getByText('Asia/Ho_Chi_Minh')).toBeOnTheScreen();
    expect(screen.getByText('vi-VN, en-US')).toBeOnTheScreen();
  });

  test('needs a name', async () => {
    const { cloud, secrets } = await signedIn('Linh');
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <CreateHomeScreen />
      </Account>,
    );
    await fireEvent.changeText(await screen.findByTestId('home-name'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Create the home' }));
    expect(screen.getByText('Type a name of up to 100 characters.')).toBeOnTheScreen();
  });

  test('says when the person is in as many homes as they may be', async () => {
    const { cloud, secrets, api } = await signedIn('Linh');
    for (let count = 0; count < runtimeSettings().cloud.simulated.homes_per_account; count++) {
      await api.createHome({ ...HOME, name: `Nhà ${count}` });
    }
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <CreateHomeScreen />
      </Account>,
    );
    await screen.findByDisplayValue("Linh's home");
    await fireEvent.press(screen.getByRole('button', { name: 'Create the home' }));
    expect(
      await screen.findByText('You are in as many homes as an account may be.'),
    ).toBeOnTheScreen();
  });
});

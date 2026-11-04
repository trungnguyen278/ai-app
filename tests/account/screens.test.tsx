// SPDX-License-Identifier: MIT
// Signing in, the account, and the header's way to it, on the simulated cloud.
import { fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import {
  AccountButton,
  AccountScreen,
  MemorySecrets,
  SignInScreen,
  useSession,
} from '@/src/account';
import { SimulatedCloud, Unreachable, type Transport } from '@/src/shared/cloud';
import { runtimeSettings } from '@/src/shared/config';
import { Catalog, CatalogProvider, CATALOGS } from '@/src/shared/catalog';
import { DesignProvider, Text } from '@/src/shared/design';
import { newQueryClient } from '@/src/shared/queries';

import { renderScreen } from '../render';
import { Account, signedIn, Status } from './render';

/** Signing in until signed in, then the account: as the routes have it. */
function Either() {
  const { state } = useSession();
  return state.status === 'signedIn' ? <AccountScreen /> : <SignInScreen />;
}

const unreachable: Transport = {
  send: async () => {
    throw new Unreachable('offline');
  },
};

async function status(text: string) {
  expect(await screen.findByText(text)).toBeOnTheScreen();
}

describe('signing in', () => {
  test('needs a name, and an email that is one, before anything is sent', async () => {
    const send = jest.fn(unreachable.send);
    await renderScreen(
      <Account transport={{ send }}>
        <SignInScreen />
      </Account>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Type a name of up to 100 characters.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('sign-in-name'), 'Linh');
    await fireEvent.changeText(screen.getByTestId('sign-in-email'), 'linh@');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('This is not an email address.')).toBeOnTheScreen();
    expect(screen.queryByText('Type a name of up to 100 characters.')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  test('signs a test person in', async () => {
    const { cloud } = runtimeSettings();
    const simulated = new SimulatedCloud(cloud.simulated, [cloud.client_id]);
    await renderScreen(
      <Account transport={simulated}>
        <SignInScreen />
        <Status />
      </Account>,
    );
    await status('signedOut');
    await fireEvent.changeText(screen.getByTestId('sign-in-name'), 'Linh');
    await fireEvent.changeText(screen.getByTestId('sign-in-email'), ' linh@example.com ');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await status('signedIn');
  });

  test('says when the cloud cannot be reached, in the phone’s language', async () => {
    await renderScreen(
      <Account transport={unreachable}>
        <SignInScreen />
      </Account>,
      ['vi'],
    );
    await fireEvent.changeText(await screen.findByTestId('sign-in-name'), 'Linh');
    await fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(
      await screen.findByText('Không kết nối được với cloud. Hãy kiểm tra mạng rồi thử lại.'),
    ).toBeOnTheScreen();
  });

  test('says so when the cloud has ended the session', async () => {
    const { cloud } = await signedIn();
    // A token this cloud never gave: a session ended elsewhere, from the cloud's view.
    const secrets = new MemorySecrets();
    secrets.kept.set('session.simulated', 'x'.repeat(43));
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <Either />
        <Status />
      </Account>,
    );
    await status('signedOut, ended');
    expect(screen.getByText('Your session has ended. Sign in again.')).toBeOnTheScreen();
  });
});

describe('the account', () => {
  test('shows the person, and signs out', async () => {
    const { cloud, secrets } = await signedIn('Linh');
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <AccountScreen />
        <Status />
      </Account>,
    );
    expect(await screen.findByRole('header', { name: 'Linh' })).toBeOnTheScreen();
    expect(screen.getByText('linh@example.com')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await status('signedOut');
    expect(secrets.kept.size).toBe(0);
  });

  test('says when it could not be read, and reads it again', async () => {
    const { cloud, secrets } = await signedIn('Linh');
    let silent = true;
    const flaky: Transport = {
      send: (request) => {
        if (silent && request.target === '/app/v1/account') {
          return Promise.reject(new Unreachable('offline'));
        }
        return cloud.send(request);
      },
    };
    await renderScreen(
      <Account
        transport={flaky}
        secrets={secrets}
        queries={newQueryClient({ retries: 0, stale_time: 0 })}
      >
        <AccountScreen />
      </Account>,
    );
    expect(
      await screen.findByText(
        'The cloud cannot be reached. Check your connection, then try again.',
      ),
    ).toBeOnTheScreen();
    silent = false;
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('header', { name: 'Linh' })).toBeOnTheScreen();
  });
});

test('the header’s way to the account shows the first letter of the name, and opens it', async () => {
  const { cloud, secrets } = await signedIn('linh');
  const catalog = new Catalog(CATALOGS, ['en'], () => {});
  await renderRouter(
    {
      _layout: () => (
        <Account transport={cloud} secrets={secrets}>
          <CatalogProvider catalog={catalog}>
            <DesignProvider>
              <Slot />
            </DesignProvider>
          </CatalogProvider>
        </Account>
      ),
      index: () => <AccountButton />,
      account: () => <Text>The account</Text>,
    },
    { initialUrl: '/' },
  );
  const link = await screen.findByRole('link', { name: 'Account' });
  // The letter only shows: screen readers hear the link's name.
  expect(await screen.findByText('L', { includeHiddenElements: true })).toBeOnTheScreen();
  await fireEvent.press(link);
  expect(await screen.findByText('The account')).toBeOnTheScreen();
  expect(screen).toHavePathname('/account');
});

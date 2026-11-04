// SPDX-License-Identifier: MIT
// One person in a home, on the simulated cloud: what each role may do to them, renaming, a name
// changed meanwhile, and removing or leaving, which the phone's own dialog confirms first.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert, type AlertButton } from 'react-native';

import type { QueryClient } from '@tanstack/react-query';

import { PersonScreen } from '@/src/homes';
import { HOMES } from '@/src/homes/domain/keys';
import { runtimeSettings } from '@/src/shared/config';
import { newQueryClient } from '@/src/shared/queries';

import { Account, signedIn } from '../account/render';
import { renderScreen } from '../render';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), canGoBack: () => true },
}));

const HOME = { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi'] };

/**
 * Linh's home: Linh the owner, An an admin, Minh a member, and Bà a profile. Each person's
 * session, and the member IDs by name.
 */
async function household() {
  const linh = await signedIn('Linh');
  const home = await linh.api.createHome(HOME);
  const people = { an: await signedIn('An', linh.cloud), minh: await signedIn('Minh', linh.cloud) };
  for (const person of Object.values(people)) {
    const { code } = await linh.api.createInvitation(home.id);
    await person.api.acceptInvitation(code);
  }
  await linh.api.addProfile(home.id, 'Bà');
  const id = async (name: string) =>
    (await linh.api.members(home.id)).members.find((member) => member.display_name === name)!;
  const an = await id('An');
  await linh.api.updateMember(home.id, an.id, { role: 'admin' }, an.etag);
  return {
    home,
    cloud: linh.cloud,
    sessions: { linh: linh.secrets, an: people.an.secrets, minh: people.minh.secrets },
    api: linh.api,
    member: async (name: string) => (await id(name)).id,
  };
}

type Household = Awaited<ReturnType<typeof household>>;

/** `viewer` looks at the page of the person named `name`, with the query cache given. */
async function look(
  at: Household,
  viewer: keyof Household['sessions'],
  name: string,
  queries?: QueryClient,
) {
  await renderScreen(
    <Account transport={at.cloud} secrets={at.sessions[viewer]} queries={queries}>
      <PersonScreen homeId={at.home.id} memberId={await at.member(name)} />
    </Account>,
  );
  await screen.findByText(/Owner|Admin|Member|A profile/);
}

/** The phone's dialog, as the app asked for it: its title, message and buttons. */
function dialogs() {
  return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
}

function press(alert: ReturnType<typeof dialogs>, style: AlertButton['style']) {
  const buttons: AlertButton[] = alert.mock.calls.at(-1)?.[2] ?? [];
  buttons.find((button) => button.style === style)?.onPress?.();
}

afterEach(() => jest.restoreAllMocks());

describe('what each role is offered', () => {
  test('the owner renames and removes anyone else, and does not leave', async () => {
    const at = await household();
    await look(at, 'linh', 'An');
    expect(screen.getByTestId('person-name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove from the home' })).toBeOnTheScreen();
    await look(at, 'linh', 'Linh');
    expect(screen.getByTestId('person-name')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Remove from the home' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Leave the home' })).toBeNull();
  });

  test('an admin looks after members and profiles, but not the owner or an admin', async () => {
    const at = await household();
    await look(at, 'an', 'Bà');
    expect(screen.getByTestId('person-name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Remove from the home' })).toBeOnTheScreen();
    await look(at, 'an', 'Linh');
    expect(screen.queryByTestId('person-name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove from the home' })).toBeNull();
    await look(at, 'an', 'An');
    expect(screen.getByRole('button', { name: 'Leave the home' })).toBeOnTheScreen();
  });

  test('a member renames only themself, and may leave', async () => {
    const at = await household();
    await look(at, 'minh', 'Bà');
    expect(screen.getByRole('header', { name: 'Bà' })).toBeOnTheScreen();
    expect(screen.queryByTestId('person-name')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove from the home' })).toBeNull();
    await look(at, 'minh', 'Minh');
    expect(screen.getByTestId('person-name')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Leave the home' })).toBeOnTheScreen();
  });
});

describe('renaming', () => {
  test('a role taken away while the page is open is said so, not as a change meanwhile', async () => {
    const at = await household();
    await look(at, 'an', 'Bà');
    // The owner makes An a member again, while An's page still offers the admin's rename.
    const an = (await at.api.members(at.home.id)).members.find((m) => m.display_name === 'An')!;
    await at.api.updateMember(at.home.id, an.id, { role: 'member' }, an.etag);
    await fireEvent.changeText(screen.getByTestId('person-name'), 'Bà Nội');
    await fireEvent.press(screen.getByRole('button', { name: 'Save the name' }));
    expect(
      await screen.findByText('Your role in this home does not allow this.'),
    ).toBeOnTheScreen();
  });

  test("changes the person's name in the home", async () => {
    const at = await household();
    await look(at, 'linh', 'Minh');
    expect(screen.queryByRole('button', { name: 'Save the name' })).toBeNull();
    await fireEvent.changeText(screen.getByTestId('person-name'), '  Minh Anh ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save the name' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save the name' })).toBeNull());
    expect(screen.getByDisplayValue('Minh Anh')).toBeOnTheScreen();
    expect((await at.api.members(at.home.id)).members.map((m) => m.display_name)).toContain(
      'Minh Anh',
    );
  });

  test('a name changed meanwhile is said so, and the change can be saved again', async () => {
    const at = await household();
    await look(at, 'linh', 'Minh');
    const minh = (await at.api.members(at.home.id)).members.find((m) => m.display_name === 'Minh')!;
    await at.api.updateMember(at.home.id, minh.id, { display_name: 'Minh Béo' }, minh.etag);
    await fireEvent.changeText(screen.getByTestId('person-name'), 'Minh Anh');
    await fireEvent.press(screen.getByRole('button', { name: 'Save the name' }));
    expect(
      await screen.findByText(
        'Someone changed this person meanwhile, and the page shows them as they are now. Save again if you still want your change.',
      ),
    ).toBeOnTheScreen();
    // What the person typed stays, and saving now goes over the name read since.
    expect(screen.getByDisplayValue('Minh Anh')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Save the name' }));
    await waitFor(async () =>
      expect((await at.api.members(at.home.id)).members.map((m) => m.display_name)).toContain(
        'Minh Anh',
      ),
    );
  });

  test('needs a name', async () => {
    const at = await household();
    await look(at, 'linh', 'Minh');
    await fireEvent.changeText(screen.getByTestId('person-name'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Save the name' }));
    expect(screen.getByText('Type a name of up to 100 characters.')).toBeOnTheScreen();
  });
});

describe('removing and leaving', () => {
  test('removing asks first, says what goes, and removes only once agreed', async () => {
    const at = await household();
    const alert = dialogs();
    await look(at, 'linh', 'Bà');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from the home' }));
    expect(alert).toHaveBeenCalledWith(
      'Remove \u2068Bà\u2069?',
      'The profile is deleted, with what belongs to it in this home.',
      expect.any(Array),
    );
    press(alert, 'cancel');
    expect((await at.api.members(at.home.id)).members).toHaveLength(4);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from the home' }));
    press(alert, 'destructive');
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await at.api.members(at.home.id)).members.map((m) => m.display_name)).not.toContain(
      'Bà',
    );
  });

  test('removing a person with an account says that their account stays', async () => {
    const at = await household();
    const alert = dialogs();
    await look(at, 'linh', 'Minh');
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from the home' }));
    expect(alert.mock.calls[0][1]).toBe(
      'What belongs to them in this home is deleted. Their account and their other homes stay.',
    );
  });

  test('leaving asks first, then leaves the home for the main screen', async () => {
    const at = await household();
    const alert = dialogs();
    const queries = newQueryClient(runtimeSettings().queries);
    await look(at, 'minh', 'Minh', queries);
    await fireEvent.press(screen.getByRole('button', { name: 'Leave the home' }));
    expect(alert.mock.calls[0][0]).toBe('Leave \u2068Nhà Linh\u2069?');
    press(alert, 'destructive');
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect((await at.api.members(at.home.id)).members.map((m) => m.display_name)).not.toContain(
      'Minh',
    );
    // The cloud no longer shows the home to Minh, and neither does the cache.
    expect(queries.getQueryData<{ id: string }[]>(HOMES)?.map((home) => home.id)).not.toContain(
      at.home.id,
    );
    expect(queries.getQueryCache().findAll({ queryKey: ['homes', at.home.id] })).toEqual([]);
  });
});

test('a person no longer in the home is said so', async () => {
  const at = await household();
  const ba = await at.member('Bà');
  await at.api.removeMember(at.home.id, ba);
  await renderScreen(
    <Account transport={at.cloud} secrets={at.sessions.linh}>
      <PersonScreen homeId={at.home.id} memberId={ba} />
    </Account>,
  );
  expect(await screen.findByText('This person is no longer in the home.')).toBeOnTheScreen();
});

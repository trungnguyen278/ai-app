// SPDX-License-Identifier: MIT
// One person in a home, on the simulated cloud: what each role may do to them, renaming, a name
// changed meanwhile, their role, and removing or leaving, which the phone's own dialog confirms
// first.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Alert, type AlertButton } from 'react-native';

import type { QueryClient } from '@tanstack/react-query';

import { HomeScreen, PersonScreen } from '@/src/homes';
import { HOMES } from '@/src/homes/domain/keys';
import type { CloudRequest, CloudResponse, Transport } from '@/src/shared/cloud';
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
    apis: { an: people.an.api, minh: people.minh.api },
    /** The person named `name`, as the cloud has them now. */
    person: id,
    member: async (name: string) => (await id(name)).id,
  };
}

type Household = Awaited<ReturnType<typeof household>>;

/** `viewer` looks at the page of the person named `name`, through `transport` if given. */
async function look(
  at: Household,
  viewer: keyof Household['sessions'],
  name: string,
  queries?: QueryClient,
  transport: Transport = at.cloud,
) {
  await renderScreen(
    <Account transport={transport} secrets={at.sessions[viewer]} queries={queries}>
      <PersonScreen homeId={at.home.id} memberId={await at.member(name)} />
    </Account>,
  );
  // What the person is, under their name, and the roles the owner may choose between.
  await screen.findAllByText(/^(Owner|Admin|Member|A profile, who does not sign in)$/);
}

/** The cloud as the page reaches it: what it is sent, and the requests of `held`, which wait
 *  until `release`. */
class Relay implements Transport {
  readonly sent: CloudRequest[] = [];
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly cloud: Transport,
    private readonly held?: CloudRequest['method'],
  ) {}

  async send(request: CloudRequest): Promise<CloudResponse> {
    this.sent.push(request);
    if (request.method === this.held) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    return this.cloud.send(request);
  }

  /** How many times the open invitations were read. */
  invitationReads(): number {
    return this.sent.filter(
      (request) => request.method === 'GET' && request.target.includes('/invitations'),
    ).length;
  }

  release() {
    for (const send of this.waiting.splice(0)) send();
  }
}

const role = (name: string) => screen.getByRole('radio', { name });

/** The phone's dialog, as the app asked for it: its title, message and buttons. */
function dialogs() {
  return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
}

function press(alert: ReturnType<typeof dialogs>, style: AlertButton['style']) {
  const buttons: AlertButton[] = alert.mock.calls.at(-1)?.[2] ?? [];
  buttons.find((button) => button.style === style)?.onPress?.();
}

// The router's stand-ins keep their calls from one test to the next unless cleared.
beforeEach(() => jest.clearAllMocks());
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

describe('roles', () => {
  const REVOKED = 'Invitations from \u2068An\u2069 not yet used are revoked.';

  test('only the owner chooses one, for another person with an account', async () => {
    const at = await household();
    await look(at, 'linh', 'An');
    expect(role('Admin')).toBeChecked();
    expect(role('Member')).not.toBeChecked();
    await look(at, 'linh', 'Minh');
    expect(role('Member')).toBeChecked();
    // Not for the owner, nor for a profile; and not for an admin or a member, whoever they see.
    for (const [viewer, name] of [
      ['linh', 'Linh'],
      ['linh', 'Bà'],
      ['an', 'Minh'],
      ['an', 'An'],
      ['minh', 'An'],
    ] as const) {
      await look(at, viewer, name);
      expect(screen.queryAllByRole('radio')).toEqual([]);
    }
  });

  test('each role says what it allows, after its name, the one that allows most first', async () => {
    const at = await household();
    await look(at, 'linh', 'Minh');
    expect(screen.getByText('Role in this home')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio').map((radio) => radio.props.accessibilityLabel)).toEqual([
      'Admin',
      'Member',
    ]);
    expect(role('Admin').props.accessibilityHint).toBe(
      'Changes the home, invites people, adds profiles, and renames or removes members and profiles.',
    );
    expect(role('Member').props.accessibilityHint).toBe(
      "Uses the home's robots, and sees who is in it.",
    );
  });

  test('makes a member an admin at once, at the cloud too', async () => {
    const at = await household();
    await look(at, 'linh', 'Minh');
    await fireEvent.press(role('Admin'));
    await waitFor(() => expect(role('Admin')).toBeChecked());
    expect((await at.person('Minh')).role).toBe('admin');
    // What Minh is, under the name, follows; and a new admin has no invitations to lose.
    expect(screen.getAllByText('Admin')).toHaveLength(2);
    expect(screen.queryByText(/not yet used are revoked/)).toBeNull();
  });

  test('making a member an admin leaves the open invitations as they were read', async () => {
    const at = await household();
    const relay = new Relay(at.cloud);
    await renderScreen(
      <Account transport={relay} secrets={at.sessions.linh}>
        <HomeScreen homeId={at.home.id} />
        <PersonScreen homeId={at.home.id} memberId={await at.member('Minh')} />
      </Account>,
    );
    await waitFor(() => expect(relay.invitationReads()).toBe(1));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Admin' }));
    // Chosen, and no longer busy: the change is done, and so is what it reads again.
    await waitFor(() => {
      expect(role('Admin')).toBeChecked();
      expect(role('Admin')).not.toBeBusy();
    });
    expect(relay.invitationReads()).toBe(1);
  });

  test('while the cloud is asked, the choice shows it, busy, and the name waits', async () => {
    const at = await household();
    const relay = new Relay(at.cloud, 'PATCH');
    await look(at, 'linh', 'An', undefined, relay);
    await fireEvent.changeText(screen.getByTestId('person-name'), 'An Nhiên');
    await fireEvent.press(role('Member'));
    await waitFor(() => expect(role('Member')).toBeBusy());
    expect(role('Member')).toBeChecked();
    expect(role('Admin')).toBeDisabled();
    expect(screen.getByTestId('person-name').props.editable).toBe(false);
    // The name is not what waits: its button is not busy, only unavailable.
    expect(screen.getByRole('button', { name: 'Save the name' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save the name' })).not.toBeBusy();
    // Nothing is said of An's invitations before the cloud has made An a member.
    expect(screen.queryByText(REVOKED)).toBeNull();
    relay.release();
    expect(await screen.findByText(REVOKED)).toBeOnTheScreen();
    expect(role('Member')).not.toBeBusy();
    expect(screen.getByTestId('person-name').props.editable).toBe(true);
    expect(screen.getByRole('button', { name: 'Save the name' })).toBeEnabled();
  });

  test('while a name is saved, or the person removed, the role waits', async () => {
    const at = await household();
    const saving = new Relay(at.cloud, 'PATCH');
    await look(at, 'linh', 'Minh', undefined, saving);
    await fireEvent.changeText(screen.getByTestId('person-name'), 'Minh Anh');
    await fireEvent.press(screen.getByRole('button', { name: 'Save the name' }));
    await waitFor(() => expect(role('Admin')).toBeDisabled());
    expect(role('Member')).not.toBeBusy();
    saving.release();
    await waitFor(() => expect(role('Admin')).toBeEnabled());

    const alert = dialogs();
    const removing = new Relay(at.cloud, 'DELETE');
    await look(at, 'linh', 'An', undefined, removing);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from the home' }));
    press(alert, 'destructive');
    await waitFor(() => expect(role('Member')).toBeDisabled());
    removing.release();
    await waitFor(() => expect(router.back).toHaveBeenCalled());
  });

  test('a person changed meanwhile is said so, and shown with the role the cloud has, to choose again', async () => {
    const at = await household();
    const buzz = jest.spyOn(Haptics, 'notificationAsync');
    await look(at, 'linh', 'Minh');
    // Meanwhile An, an admin, renames Minh: the page still has Minh as it read them.
    const minh = await at.person('Minh');
    await at.apis.an.updateMember(at.home.id, minh.id, { display_name: 'Minh Béo' }, minh.etag);
    await fireEvent.press(role('Admin'));
    expect(
      await screen.findByText(
        'Someone changed this person meanwhile, and the page shows them as they are now. Choose again if you still want your change.',
      ),
    ).toBeOnTheScreen();
    expect(buzz).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Error);
    // Said once, by the role: the name is not what was refused.
    expect(screen.queryByText(/Save again/)).toBeNull();
    expect(role('Member')).toBeChecked();
    expect(screen.getByDisplayValue('Minh Béo')).toBeOnTheScreen();
    expect((await at.person('Minh Béo')).role).toBe('member');
    await fireEvent.press(role('Admin'));
    await waitFor(() => expect(role('Admin')).toBeChecked());
    expect((await at.person('Minh Béo')).role).toBe('admin');
    expect(screen.queryByText(/Choose again/)).toBeNull();
  });

  test("making an admin a member revokes the invitations they made: the page says so, and the home's list follows", async () => {
    const at = await household();
    await at.apis.an.createInvitation(at.home.id);
    const queries = newQueryClient(runtimeSettings().queries);
    await renderScreen(
      <Account transport={at.cloud} secrets={at.sessions.linh} queries={queries}>
        <HomeScreen homeId={at.home.id} />
        <PersonScreen homeId={at.home.id} memberId={await at.member('An')} />
      </Account>,
    );
    expect(await screen.findByText('Invitation from \u2068An\u2069')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('radio', { name: 'Member' }));
    expect(await screen.findByText(REVOKED)).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByText('Invitation from \u2068An\u2069')).toBeNull());
    expect((await at.api.invitations(at.home.id)).invitations).toEqual([]);
    expect((await at.person('An')).role).toBe('member');
  });
});

describe('removing and leaving', () => {
  test('a removal that the role no longer allows is said so', async () => {
    const at = await household();
    const alert = dialogs();
    await look(at, 'an', 'Bà');
    // The owner makes An a member again, while An's page still offers the admin's removal.
    const an = await at.person('An');
    await at.api.updateMember(at.home.id, an.id, { role: 'member' }, an.etag);
    await fireEvent.press(screen.getByRole('button', { name: 'Remove from the home' }));
    press(alert, 'destructive');
    expect(
      await screen.findByText('Your role in this home does not allow this.'),
    ).toBeOnTheScreen();
    expect(router.back).not.toHaveBeenCalled();
  });

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

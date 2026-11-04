// SPDX-License-Identifier: MIT
// The people of a home, on the simulated cloud: what its owner and a member are offered, the
// invitations not yet used, inviting someone with a link, adding a profile, and joining.
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Share } from 'react-native';

import { AddProfileScreen, HomeScreen, InviteScreen, JoinScreen } from '@/src/homes';
import { runtimeSettings } from '@/src/shared/config';
import { qrShape } from '@/src/shared/design/qr';
import { newQueryClient } from '@/src/shared/queries';

import { Account, signedIn, simulatedCloud } from '../account/render';
import { camera, resetCamera } from '../mocks/camera';
import { renderScreen } from '../render';

jest.mock('expo-camera', () => jest.requireActual('../mocks/camera'));

const HOME = { name: 'Nhà Linh', time_zone: 'Asia/Ho_Chi_Minh', languages: ['vi'] };
// The cloud's time stands still, so that an invitation's expiry reads the same every run: three
// days on, in the phone's time zone, which is UTC in the tests (jest.config.js).
const NOW = Date.parse('2026-11-03T08:10:00Z');
const EXPIRY = 'November 6 at 8:10\\sAM';
// Whether MF2 isolates a date depends on what the platform's Intl says of its direction, so the
// texts with one are read without the isolating marks.
const unmarked = { normalizer: (text: string) => text.replace(/[\u2066-\u2069]/g, '') };
const { simulated } = runtimeSettings().cloud;

/** Linh's home, an invitation to it, and Minh, signed in on the same cloud, to whom it went. */
async function invited() {
  const owner = await signedIn(
    'Linh',
    simulatedCloud(() => NOW),
  );
  const home = await owner.api.createHome(HOME);
  const { code } = await owner.api.createInvitation(home.id);
  const minh = await signedIn('Minh', owner.cloud);
  return { owner, home, code, minh };
}

/** The link the invitation screen shows, and the code that is its fragment. */
async function shownLink() {
  const link: string = (await screen.findByTestId('invitation-link')).props.children;
  return { link, code: link.slice(link.indexOf('#') + 1) };
}

describe('the people of a home', () => {
  test('its owner may invite people and add profiles, and sees the invitations not yet used', async () => {
    const { owner, home } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={owner.secrets}>
        <HomeScreen homeId={home.id} />
      </Account>,
    );
    expect(
      await screen.findByRole('header', { name: 'Invitations not yet used' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Invitation from \u2068Linh\u2069')).toBeOnTheScreen();
    expect(screen.getByText(new RegExp(`^Expires ${EXPIRY}$`), unmarked)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Invite someone' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add a profile' })).toBeOnTheScreen();
  });

  test('revoking an invitation takes it away, at the cloud too', async () => {
    const { owner, home } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={owner.secrets}>
        <HomeScreen homeId={home.id} />
      </Account>,
    );
    // Each button says which invitation it revokes; its label starts with what it shows.
    const revoke = await screen.findByRole('button', {
      name: new RegExp(`^Revoke the invitation from .?Linh.?, which expires .?${EXPIRY}.?$`),
    });
    expect(screen.getByText('Revoke')).toBeOnTheScreen();
    await fireEvent.press(revoke);
    await waitFor(() =>
      expect(screen.queryByRole('header', { name: 'Invitations not yet used' })).toBeNull(),
    );
    expect((await owner.api.invitations(home.id)).invitations).toEqual([]);
  });

  test('revoking one used since the list was read is no failure, and the list follows', async () => {
    const { owner, home, code, minh } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={owner.secrets}>
        <HomeScreen homeId={home.id} />
      </Account>,
    );
    await screen.findByText('Revoke');
    await minh.api.acceptInvitation(code);
    await fireEvent.press(screen.getByText('Revoke'));
    await waitFor(() =>
      expect(screen.queryByRole('header', { name: 'Invitations not yet used' })).toBeNull(),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('a member is offered neither, and sees no invitations', async () => {
    const { owner, home, minh } = await invited();
    const { code } = await owner.api.createInvitation(home.id);
    await minh.api.acceptInvitation(code);
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <HomeScreen homeId={home.id} />
      </Account>,
    );
    expect(await screen.findByText('\u2068Minh\u2069 (you)')).toBeOnTheScreen();
    // Minh's role, under the home's name and in the list.
    expect(screen.getAllByText('Member')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Invite someone' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add a profile' })).toBeNull();
    expect(screen.queryByRole('header', { name: 'Invitations not yet used' })).toBeNull();
  });
});

describe('inviting someone', () => {
  afterEach(() => jest.restoreAllMocks());

  test('makes a link, with the code as its fragment, and shares it', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const { cloud, secrets, api } = await signedIn(
      'Linh',
      simulatedCloud(() => NOW),
    );
    const home = await api.createHome(HOME);
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <InviteScreen homeId={home.id} />
      </Account>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Make a link' }));
    const { link, code } = await shownLink();
    expect(link).toMatch(/\/join#[A-Za-z0-9_-]{43}$/);
    // The QR code carries the link (tests/shared/design/qr.test.ts reads its shape back).
    expect(screen.getByRole('image', { name: 'A QR code of the link' })).toBeOnTheScreen();
    expect(screen.getByTestId('skia-path').props.path).toBe(qrShape(link).path);
    expect(
      screen.getByText(new RegExp(`^It works once, and expires ${EXPIRY}\\.$`), unmarked),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Share the link' }));
    // The message leaves the app: without the marks that isolate its values on the screen.
    expect(share).toHaveBeenCalledWith({ message: `You are invited to join Nhà Linh: ${link}` });
    // The code is the invitation's: the person it reaches sees the home with it.
    const minh = await signedIn('Minh', cloud);
    expect(await minh.api.lookUpInvitation(code)).toMatchObject({
      home_name: 'Nhà Linh',
      invited_by: 'Linh',
    });
  });

  test('forgets the code with the screen, since nothing can show it again', async () => {
    const queries = newQueryClient(runtimeSettings().queries);
    const { cloud, secrets, api } = await signedIn('Linh');
    const home = await api.createHome(HOME);
    const view = await renderScreen(
      <Account transport={cloud} secrets={secrets} queries={queries}>
        <InviteScreen homeId={home.id} />
      </Account>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Make a link' }));
    const { code } = await shownLink();
    const kept = () =>
      JSON.stringify(
        queries
          .getMutationCache()
          .getAll()
          .map((m) => m.state),
      );
    expect(kept()).toContain(code);
    await view.unmount();
    await waitFor(() => expect(kept()).not.toContain(code));
  });

  test('says when the home has as many invitations not yet used as it may have', async () => {
    const { cloud, secrets, api } = await signedIn('Linh');
    const home = await api.createHome(HOME);
    for (let count = 0; count < simulated.invitations_per_home; count++) {
      await api.createInvitation(home.id);
    }
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <InviteScreen homeId={home.id} />
      </Account>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Make a link' }));
    expect(
      await screen.findByText(
        "This home has as many invitations not yet used as it may have. Revoke one on the home's page first.",
      ),
    ).toBeOnTheScreen();
  });
});

describe('adding a profile', () => {
  test('needs a name', async () => {
    const { cloud, secrets, api } = await signedIn('Linh');
    const home = await api.createHome(HOME);
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <AddProfileScreen homeId={home.id} />
      </Account>,
    );
    await fireEvent.changeText(await screen.findByTestId('profile-name'), '   ');
    await fireEvent.press(screen.getByRole('button', { name: 'Add the profile' }));
    expect(screen.getByText('Type a name of up to 100 characters.')).toBeOnTheScreen();
    expect((await api.members(home.id)).members).toHaveLength(1);
  });

  test('says when the home has as many people as it may have', async () => {
    const { cloud, secrets, api } = await signedIn('Linh');
    const home = await api.createHome(HOME);
    // The owner is one of them.
    for (let count = 1; count < simulated.members_per_home; count++) {
      await api.addProfile(home.id, `Người ${count}`);
    }
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <AddProfileScreen homeId={home.id} />
      </Account>,
    );
    await fireEvent.changeText(await screen.findByTestId('profile-name'), 'Bà');
    await fireEvent.press(screen.getByRole('button', { name: 'Add the profile' }));
    expect(
      await screen.findByText('This home has as many people as it may have.'),
    ).toBeOnTheScreen();
  });

  test('is for a home the person is in', async () => {
    const { cloud, secrets } = await signedIn('Linh');
    await renderScreen(
      <Account transport={cloud} secrets={secrets}>
        <AddProfileScreen homeId="01a1a06c-1400-7ffd-b448-26955bb4d510" />
      </Account>,
    );
    expect(await screen.findByText('You are not in this home.')).toBeOnTheScreen();
    expect(screen.queryByTestId('profile-name')).toBeNull();
  });
});

describe('joining a home', () => {
  test("a link's code shows who invites, to which home, and until when", async () => {
    const { owner, code, minh } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <JoinScreen link={code} />
      </Account>,
    );
    expect(await screen.findByText('\u2068Linh\u2069 invites you to join')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Nhà Linh' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        new RegExp(`^You will join as a member\\. The invitation expires ${EXPIRY}\\.$`),
        unmarked,
      ),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Join the home' })).toBeOnTheScreen();
  });

  test('takes a pasted link as well as an opened one', async () => {
    const { owner, code, minh } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <JoinScreen />
      </Account>,
    );
    await fireEvent.changeText(
      await screen.findByTestId('invitation-link'),
      ` https://cloud.example/join#${code} `,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('header', { name: 'Nhà Linh' })).toBeOnTheScreen();
  });

  test('reads the QR code on the phone of the person who invites', async () => {
    resetCamera({ granted: true, canAskAgain: true });
    const { owner, code, minh } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <JoinScreen />
      </Account>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan a QR code' }));
    await act(async () => camera.report?.({ type: 'qr', data: 'https://example.com/menu' }));
    expect(screen.getByText('This QR code is not an invitation.')).toBeOnTheScreen();
    await act(async () =>
      camera.report?.({ type: 'qr', data: `https://cloud.example/join#${code}` }),
    );
    expect(await screen.findByRole('header', { name: 'Nhà Linh' })).toBeOnTheScreen();
  });

  test('a person who would rather paste the link goes back to the field', async () => {
    resetCamera({ granted: false, canAskAgain: true });
    const { owner, minh } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <JoinScreen />
      </Account>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan a QR code' }));
    expect(
      screen.getByText(
        'The app uses the camera to read the QR code on the phone of the person who invites you.',
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Paste a link instead' }));
    expect(screen.getByTestId('invitation-link')).toBeOnTheScreen();
    expect(camera.asked).toBe(0);
  });

  test('says what is not an invitation link', async () => {
    const { owner, minh } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <JoinScreen link="not-a-code" />
      </Account>,
    );
    expect(await screen.findByText('This is not an invitation link.')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('invitation-link'), 'https://cloud.example/join');
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('This is not an invitation link.')).toBeOnTheScreen();
    expect(screen.queryByText('Or its code alone.')).toBeNull();
  });

  test('a revoked invitation cannot be used, and another link can be tried', async () => {
    const { owner, home, code, minh } = await invited();
    const [open] = (await owner.api.invitations(home.id)).invitations;
    await owner.api.revokeInvitation(home.id, open.id);
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <JoinScreen link={code} />
      </Account>,
    );
    expect(
      await screen.findByRole('header', { name: 'This invitation cannot be used' }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Use another link' }));
    expect(screen.getByTestId('invitation-link')).toBeOnTheScreen();
  });

  test('signed out, the person signs in first', async () => {
    const { owner, code } = await invited();
    await renderScreen(
      <Account transport={owner.cloud}>
        <JoinScreen link={code} />
      </Account>,
    );
    expect(await screen.findByRole('header', { name: 'You have an invitation' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeOnTheScreen();
    expect(screen.queryByText('Nhà Linh')).toBeNull();
  });

  test('an invitation revoked while the person looks cannot be used either', async () => {
    const { owner, home, code, minh } = await invited();
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <JoinScreen link={code} />
      </Account>,
    );
    const join = await screen.findByRole('button', { name: 'Join the home' });
    const [open] = (await owner.api.invitations(home.id)).invitations;
    await owner.api.revokeInvitation(home.id, open.id);
    await fireEvent.press(join);
    expect(
      await screen.findByRole('header', { name: 'This invitation cannot be used' }),
    ).toBeOnTheScreen();
  });

  test('says when the person is in as many homes as they may be', async () => {
    const { owner, code, minh } = await invited();
    for (let count = 0; count < simulated.homes_per_account; count++) {
      await minh.api.createHome({ ...HOME, name: `Nhà ${count}` });
    }
    await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets}>
        <JoinScreen link={code} />
      </Account>,
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Join the home' }));
    expect(
      await screen.findByText('You are in as many homes as an account may be.'),
    ).toBeOnTheScreen();
  });

  test('forgets the code with the screen', async () => {
    const { owner, code, minh } = await invited();
    for (let count = 0; count < simulated.homes_per_account; count++) {
      await minh.api.createHome({ ...HOME, name: `Nhà ${count}` });
    }
    const queries = newQueryClient(runtimeSettings().queries);
    const view = await renderScreen(
      <Account transport={owner.cloud} secrets={minh.secrets} queries={queries}>
        <JoinScreen link={code} />
      </Account>,
    );
    // The preview read it, and joining sent it: the home limit leaves both on the screen.
    await fireEvent.press(await screen.findByRole('button', { name: 'Join the home' }));
    await screen.findByText('You are in as many homes as an account may be.');
    const kept = () =>
      JSON.stringify([
        queries
          .getQueryCache()
          .getAll()
          .map((query) => query.queryKey),
        queries
          .getMutationCache()
          .getAll()
          .map((mutation) => mutation.state.variables),
      ]);
    expect(kept()).toContain(code);
    await view.unmount();
    await waitFor(() => expect(kept()).not.toContain(code));
  });
});

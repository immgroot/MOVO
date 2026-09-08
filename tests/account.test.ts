import { afterEach, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { createAccountService, attachAccounts } from '../server/auth';
import { createGameService } from '../server/service';
import { accountError, accountValidation } from '../shared/account';
import AccountPanel, { AccountMenu } from '../components/game/Account';
import type { Welcome, Reply } from '../shared/protocol';
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
const password = 'A synthetic table passphrase 2026!';
async function setup(database = ':memory:', rateLimit = false) {
  const game = createGameService({ autoTick: false });
  const port = await game.listen(0),
    baseURL = `http://localhost:${port}`;
  const accounts = await createAccountService({
    database,
    baseURL,
    rateLimit,
    secret: 'synthetic-account-test-secret-at-least-32-characters',
  });
  attachAccounts(game.http, accounts);
  let closed = false;
  const close = async () => {
    if (!closed) {
      closed = true;
      await game.close();
      accounts.close();
    }
  };
  cleanup.push(close);
  let cookie = '';
  async function request(
    path: string,
    body?: object,
    extraHeaders: Record<string, string> = {},
  ) {
    const r = await fetch(`${baseURL}/api/auth/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        Origin: baseURL,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) cookie = cookies.map((c) => c.split(';')[0]).join('; ');
    const data = await r.json();
    return { status: r.status, headers: r.headers, cookies, data };
  }
  const signup = (email = 'table@example.com', name = 'GROOT') =>
    request('sign-up/email', { email, name, password });
  return {
    request,
    signup,
    accounts,
    game,
    baseURL,
    close,
    setCookie: (value: string) => {
      cookie = value;
    },
    getCookie: () => cookie,
  };
}
it('creates a real account, hashes its password, and exposes only public profile data in a cookie session', async () => {
  const s = await setup(),
    created = await s.signup();
  expect(created.status).toBe(200);
  expect(
    created.cookies.some((c) => /HttpOnly/i.test(c) && /SameSite=Lax/i.test(c)),
  ).toBe(true);
  expect(created.headers.get('cache-control')).toBe('no-store');
  const stored = s.accounts.db
    .prepare('SELECT password FROM account')
    .get() as { password: string };
  expect(stored.password).not.toBe(password);
  expect(stored.password.length).toBeGreaterThan(64);
  const session = await s.request('get-session');
  expect(session.data.user).toMatchObject({
    name: 'GROOT',
    email: 'table@example.com',
    emailVerified: false,
  });
  expect(JSON.stringify(session.data)).not.toContain(password);
  expect(session.data.user.password).toBeUndefined();
});
it('signs out, invalidates the old cookie, and signs back in', async () => {
  const s = await setup();
  await s.signup();
  const cookie = s.getCookie();
  expect((await s.request('sign-out', {})).status).toBe(200);
  s.setCookie(cookie);
  expect((await s.request('get-session')).data).toBeNull();
  expect(
    (await s.request('sign-in/email', { email: 'table@example.com', password }))
      .status,
  ).toBe(200);
  expect((await s.request('get-session')).data.user.name).toBe('GROOT');
});
it('returns the same generic login failure for unknown accounts and wrong passwords', async () => {
  const s = await setup();
  await s.signup();
  await s.request('sign-out', {});
  for (const email of ['table@example.com', 'unknown@example.com']) {
    const r = await s.request('sign-in/email', {
      email,
      password: 'A wrong password deliberately',
    });
    expect(r.status).toBe(401);
    expect(r.data.code).toBe('INVALID_EMAIL_OR_PASSWORD');
  }
});
it.each([
  { name: 'GROOT', email: 'bad', password },
  { name: 'GROOT', email: 'table@example.com', password: 'short' },
  { name: ' ', email: 'table@example.com', password },
  { name: 'x'.repeat(19), email: 'table@example.com', password },
])('enforces signup validation on the server: %j', async (body) => {
  const s = await setup();
  expect((await s.request('sign-up/email', body)).status).toBe(400);
  expect(
    s.accounts.db.prepare('SELECT count(*) AS n FROM user').get(),
  ).toMatchObject({ n: 0 });
});
it('updates only the authenticated profile and rejects unauthenticated writes', async () => {
  const s = await setup();
  expect((await s.request('update-user', { name: 'Intruder' })).status).toBe(
    401,
  );
  await s.signup();
  expect((await s.request('update-user', { name: '  NIDA  ' })).status).toBe(
    200,
  );
  expect((await s.request('get-session')).data.user.name).toBe('NIDA');
  expect(
    (await s.request('update-user', { name: 'x'.repeat(19) })).status,
  ).toBe(400);
});
it('rejects cross-origin account mutations without destroying the real session', async () => {
  const s = await setup();
  await s.signup();
  expect(
    (await s.request('sign-out', {}, { Origin: 'https://untrusted.example' }))
      .status,
  ).toBe(403);
  expect((await s.request('get-session')).data.user.name).toBe('GROOT');
});
it('persists accounts and sessions across a complete service restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'movo-account-test-'));
  cleanup.push(() => {
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir()) + sep))
      throw Error('Unsafe cleanup target');
    rmSync(target, { recursive: true, force: true });
  });
  const database = join(directory, 'accounts.sqlite');
  const first = await setup(database);
  await first.signup();
  expect(
    (
      await first.request('update-user', {
        avatar: 'kite',
        banner: 'gold',
        boardTheme: 'classic',
      })
    ).status,
  ).toBe(200);
  const cookie = first.getCookie(),
    id = (await first.request('get-session')).data.user.id;
  await first.close();
  const second = await setup(database);
  second.setCookie(cookie);
  expect((await second.request('get-session')).data.user.id).toBe(id);
  expect((await second.request('get-session')).data.user).toMatchObject({
    avatar: 'kite',
    banner: 'gold',
    boardTheme: 'classic',
  });
  await second.request('sign-out', {});
  await second.request('sign-in/email', {
    email: 'table@example.com',
    password,
  });
  expect((await second.request('get-session')).data.user).toMatchObject({
    avatar: 'kite',
    banner: 'gold',
    boardTheme: 'classic',
  });
});
it('rejects unknown cosmetic values and keeps the previous account appearance', async () => {
  const s = await setup();
  await s.signup();
  for (const body of [
    { avatar: 'https://untrusted.example/photo' },
    { banner: '../secret' },
    { boardTheme: 'future' },
  ])
    expect((await s.request('update-user', body)).status).toBe(400);
  expect((await s.request('get-session')).data.user).toMatchObject({
    avatar: 'movo',
    banner: 'classic',
    boardTheme: 'premium',
  });
});
it('rate limits repeated signups despite forged forwarding headers', async () => {
  const s = await setup(':memory:', true);
  for (let i = 0; i < 5; i++)
    expect(
      (
        await s.request(
          'sign-up/email',
          { name: 'GROOT', email: 'invalid', password },
          {
            'x-movo-auth-peer': `10.0.0.${i}`,
            'x-forwarded-for': `10.0.1.${i}`,
          },
        )
      ).status,
    ).toBe(400);
  expect(
    (
      await s.request(
        'sign-up/email',
        { name: 'GROOT', email: 'invalid', password },
        { 'x-movo-auth-peer': '10.1.2.3' },
      )
    ).status,
  ).toBe(429);
});
it('guest room and reconnect IDs survive account creation and signout', async () => {
  const s = await setup();
  const sockets: Socket[] = [];
  cleanup.push(() => sockets.forEach((socket) => socket.disconnect()));
  async function connect(token?: string) {
    const socket = io(s.baseURL, {
      auth: { v: 1, token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    const welcome = await new Promise<Welcome>((done, reject) => {
      socket.once('welcome', done);
      socket.once('connect_error', reject);
    });
    return { socket, welcome };
  }
  const guest = await connect();
  const reply = await new Promise<Reply>((done) =>
    guest.socket.emit(
      'intent',
      {
        v: 1,
        requestId: crypto.randomUUID(),
        type: 'create',
        name: 'Guest GROOT',
        settings: {
          mode: 'REVENGE',
          capacity: 4,
          name: 'Guest test',
          timerSeconds: 0,
          private: true,
          spectators: true,
        },
      },
      done,
    ),
  );
  expect(reply.ok).toBe(true);
  const room = s.game.rooms.get(reply.snapshot!.code)!;
  await s.signup();
  expect((await s.request('get-session')).data.user.id).not.toBe(
    guest.welcome.playerId,
  );
  await s.request('sign-out', {});
  expect(room.members[0].id).toBe(guest.welcome.playerId);
  expect(room.members[0].name).toBe('Guest GROOT');
  guest.socket.disconnect();
  const restored = await connect(guest.welcome.token);
  expect(restored.welcome.playerId).toBe(guest.welcome.playerId);
  expect(restored.welcome.snapshot?.code).toBe(reply.snapshot!.code);
});
it('renders optional guest entry and a guest menu without fake provider buttons', () => {
  const html = renderToStaticMarkup(
    createElement(AccountPanel, {
      view: 'entry',
      cosmetics: { avatar: 'movo', banner: 'classic' },
      theme: 'premium',
      guestName: 'GROOT',
      onSaveAppearance: async () => {},
      onSaveGuestName: async () => {},
      loading: false,
      onView: () => {},
      onGuest: () => {},
      onAuthenticated: () => {},
      onSignOut: () => {},
      inRoom: false,
    }),
  );
  expect(html).toContain('Continue as guest');
  expect(html).toContain('Sign in');
  expect(html).toContain('Create account');
  expect(html).not.toContain('Google');
  const menu = renderToStaticMarkup(
    createElement(AccountMenu, {
      onOpen: () => {},
      onSettings: () => {},
      onSignOut: () => {},
    }),
  );
  expect(menu).toContain('PLAYING AS GUEST');
});
it('renders real profile metadata, editable name and signout without fabricated statistics', () => {
  const html = renderToStaticMarkup(
    createElement(AccountPanel, {
      view: 'profile',
      cosmetics: { avatar: 'movo', banner: 'classic' },
      theme: 'premium',
      guestName: 'GROOT',
      onSaveAppearance: async () => {},
      onSaveGuestName: async () => {},
      user: {
        name: 'GROOT',
        email: 'groot@example.com',
        emailVerified: false,
        createdAt: '2026-09-06T00:00:00Z',
      },
      loading: false,
      onView: () => {},
      onGuest: () => {},
      onAuthenticated: () => {},
      onSignOut: () => {},
      inRoom: true,
    }),
  );
  for (const value of [
    'GROOT',
    'groot@example.com',
    'Not verified',
    'Save profile',
    'Sign out',
    'current table keeps',
  ])
    expect(html).toContain(value);
  expect(html).not.toContain('Games played');
  expect(html).not.toContain('Wins');
});
it('validates account forms and sanitizes unknown server error codes', () => {
  expect(accountValidation('signin', { email: 'bad', password })).toContain(
    'valid email',
  );
  expect(
    accountValidation('signin', { email: 'groot@example.com', password: '' }),
  ).not.toBe('');
  expect(
    accountValidation('signup', {
      name: 'GROOT',
      email: 'groot@example.com',
      password,
      confirm: 'different',
    }),
  ).toContain('do not match');
  expect(
    accountValidation('signup', {
      name: 'GROOT',
      email: 'groot@example.com',
      password,
      confirm: password,
    }),
  ).toBe('');
  expect(accountError('SQLITE internal database path')).toBe(
    'Connection failed. Please try again.',
  );
});

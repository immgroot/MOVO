import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { getMigrations } from 'better-auth/db/migration';
import { toNodeHandler } from 'better-auth/node';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Server, RequestListener } from 'node:http';
import {
  AVATARS,
  BANNERS,
  BOARD_STYLES,
  cosmeticFields,
} from '../shared/cosmetics';

function validName(name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 18 || /\p{Cc}/u.test(clean))
    throw new APIError('BAD_REQUEST', {
      code: 'INVALID_DISPLAY_NAME',
      message: 'Choose a display name of 1–18 characters.',
    });
  return clean;
}
function localSecret(path: string) {
  mkdirSync(dirname(path), { recursive: true });
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const secret = randomBytes(48).toString('base64url');
    try {
      writeFileSync(path, secret, { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      return readFileSync(path, 'utf8').trim();
    }
    return secret;
  }
}
export async function createAccountService(
  options: {
    database?: string;
    baseURL?: string;
    secret?: string;
    secretPath?: string;
    rateLimit?: boolean;
    cookiePrefix?: string;
  } = {},
) {
  const path =
    options.database ?? process.env.MOVO_AUTH_DB ?? '.data/accounts.sqlite';
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000',
  );
  const baseURL =
    options.baseURL ?? process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
  const secret =
    options.secret ??
    process.env.BETTER_AUTH_SECRET ??
    localSecret(options.secretPath ?? '.data/auth-secret');
  const auth = betterAuth({
    appName: 'MOVO',
    baseURL,
    basePath: '/api/auth',
    secret,
    database: db,
    trustedOrigins: [new URL(baseURL).origin],
    user: { additionalFields: cosmeticFields },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    account: {
      identityStrategy: 'provider-id',
      accountLinking: { enabled: false },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: options.cookiePrefix ?? 'movo-account',
      useSecureCookies: baseURL.startsWith('https:'),
      ipAddress: { ipAddressHeaders: ['x-movo-auth-peer'] },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    rateLimit: {
      enabled: options.rateLimit ?? true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...validAppearance(user), name: validName(user.name) },
          }),
        },
        update: {
          before: async (user) => ({
            data: {
              ...validAppearance(user),
              ...(typeof user.name === 'string'
                ? { name: validName(user.name) }
                : {}),
            },
          }),
        },
      },
    },
    telemetry: { enabled: false },
  });
  try {
    const migration = await getMigrations(auth.options);
    await migration.runMigrations();
  } catch (error) {
    db.close();
    throw error;
  }
  return { auth, db, close: () => db.close() };
}

// Account cookies identify accounts only. The game keeps its existing opaque
// guest token, participant IDs and reconnect protocol, even after sign-out.
export function attachAccounts(
  http: Server,
  accounts: Awaited<ReturnType<typeof createAccountService>>,
) {
  const previous = http.listeners('request') as RequestListener[];
  const handler = toNodeHandler(accounts.auth);
  http.removeAllListeners('request');
  http.on('request', (req, res) => {
    const path = (req.url ?? '').split('?')[0];
    if (path === '/api/auth' || path.startsWith('/api/auth/')) {
      // A client-supplied forwarding header cannot bypass per-peer auth limits.
      req.headers['x-movo-auth-peer'] = req.socket.remoteAddress ?? '127.0.0.1';
      res.setHeader('Cache-Control', 'no-store');
      void handler(req, res).catch(() => {
        if (!res.headersSent)
          res.writeHead(503, { 'Content-Type': 'application/json' });
        if (!res.writableEnded)
          res.end(
            JSON.stringify({
              code: 'ACCOUNT_UNAVAILABLE',
              message: 'Connection failed. Please try again.',
            }),
          );
      });
    } else for (const listener of previous) listener.call(http, req, res);
  });
}
function validAppearance(user: Record<string, unknown>) {
  for (const [field, allowed] of Object.entries({
    avatar: AVATARS.map((a) => a.id),
    banner: BANNERS.map((b) => b.id),
    boardTheme: BOARD_STYLES,
  })) {
    if (
      user[field] !== undefined &&
      !(allowed as readonly unknown[]).includes(user[field])
    )
      throw new APIError('BAD_REQUEST', {
        code: 'INVALID_APPEARANCE',
        message: 'Choose one of the available MOVO styles.',
      });
  }
  return user;
}

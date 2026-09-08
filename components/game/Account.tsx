'use client';
import { useState, type SyntheticEvent } from 'react';
import {
  ArrowRight,
  UserRound,
  LogOut,
  Settings2,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { accountClient } from '../../lib/account-client';
import { Avatar, CosmeticEditor } from './Cosmetics';
import type { BoardStyle, Cosmetics } from '../../shared/cosmetics';
import {
  accountError,
  accountValidation,
  type AccountView,
} from '../../shared/account';

export type AccountUser = {
  avatar?: string | null;
  banner?: string | null;
  boardTheme?: string | null;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date | string;
};
export function AccountMenu({
  user,
  onOpen,
  onSettings,
  onSignOut,
}: {
  user?: AccountUser | null;
  onOpen: (view: AccountView) => void;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  function close(e: SyntheticEvent<HTMLButtonElement>, action: () => void) {
    e.currentTarget.closest('details')?.removeAttribute('open');
    action();
  }
  return (
    <details className="account-menu">
      <summary aria-label={user ? 'Account menu' : 'Guest account menu'}>
        <span className="account-avatar-mini" aria-hidden="true">
          {user ? (
            <Avatar id={user.avatar ?? 'movo'} />
          ) : (
            <UserRound size={17} />
          )}
        </span>
        <span>{user ? user.name : 'Guest'}</span>
      </summary>
      <div className="account-dropdown">
        <small>{user ? 'YOUR MOVO ACCOUNT' : 'PLAYING AS GUEST'}</small>
        <button
          onClick={(e) => close(e, () => onOpen(user ? 'profile' : 'signin'))}
        >
          <UserRound size={15} />
          {user ? 'Profile' : 'Sign in'}
        </button>
        {!user && (
          <button onClick={(e) => close(e, () => onOpen('profile'))}>
            <UserRound size={15} />
            Guest profile
          </button>
        )}
        {!user && (
          <button onClick={(e) => close(e, () => onOpen('signup'))}>
            <ArrowRight size={15} />
            Create account
          </button>
        )}
        <button onClick={(e) => close(e, onSettings)}>
          <Settings2 size={15} />
          Settings
        </button>
        {user && (
          <button onClick={(e) => close(e, onSignOut)}>
            <LogOut size={15} />
            Sign out
          </button>
        )}
      </div>
    </details>
  );
}

export default function AccountPanel({
  view,
  user,
  loading,
  onView,
  onGuest,
  onAuthenticated,
  onSignOut,
  inRoom,
  cosmetics,
  theme,
  onSaveAppearance,
  guestName,
  onSaveGuestName,
}: {
  view: AccountView;
  user?: AccountUser | null;
  loading: boolean;
  onView: (view: AccountView) => void;
  onGuest: () => void;
  onAuthenticated: (name: string) => void;
  onSignOut: () => void;
  inRoom: boolean;
  cosmetics: Cosmetics;
  theme: BoardStyle;
  guestName: string;
  onSaveAppearance: (
    v: Cosmetics & { boardTheme: BoardStyle },
  ) => Promise<string | void>;
  onSaveGuestName: (name: string) => Promise<string | void>;
}) {
  const [name, setName] = useState(user?.name ?? guestName),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setSaved(false);
    if (view === 'profile') {
      if (!name.trim() || name.trim().length > 18) {
        setError('Choose a display name of 1–18 characters.');
        return;
      }
    } else if (view === 'signin' || view === 'signup') {
      const message = accountValidation(view, {
        name,
        email,
        password,
        confirm,
      });
      if (message) {
        setError(message);
        return;
      }
    } else return;
    setError('');
    setBusy(true);
    try {
      if (view === 'profile') {
        const result = await accountClient.updateUser({ name: name.trim() });
        if (result.error) setError(accountError(result.error.code));
        else {
          await accountClient.getSession({
            fetchOptions: { cache: 'no-store' },
          });
          setSaved(true);
        }
      } else {
        const result =
          view === 'signup'
            ? await accountClient.signUp.email({
                name: name.trim(),
                email: email.trim(),
                password,
              })
            : await accountClient.signIn.email({
                email: email.trim(),
                password,
              });
        if (result.error) setError(accountError(result.error.code));
        else {
          setPassword('');
          setConfirm('');
          onAuthenticated(result.data.user.name);
        }
      }
    } catch {
      setError('Connection failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  if (view === 'entry')
    return (
      <div className="account-entry">
        <div className="account-motif" aria-hidden="true">
          <span>◆</span>
          <span>✳</span>
          <span>▲</span>
          <span>≋</span>
        </div>
        <p>A seat at the table is all you need.</p>
        <button className="primary-button" onClick={onGuest}>
          Continue as guest <ArrowRight size={18} />
        </button>
        <span className="account-divider">OR MAKE IT YOURS</span>
        <div className="account-entry-options">
          <button className="quiet-button" onClick={() => onView('signin')}>
            Sign in
          </button>
          <button className="quiet-button" onClick={() => onView('signup')}>
            Create account
          </button>
        </div>
        <small>
          {loading
            ? 'Checking your account…'
            : 'Free to play. An account is always optional.'}
        </small>
      </div>
    );
  if (view === 'profile' && !user)
    return (
      <div className="account-profile">
        <p className="guest-appearance-note">
          Your guest look stays on this device. No account needed.
        </p>
        <form
          className="account-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            const error = await onSaveGuestName(name);
            setError(error ?? '');
            if (!error) setSaved(true);
          }}
        >
          <label>
            Display name
            <input
              value={name}
              maxLength={18}
              disabled={inRoom}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {!inRoom && <button className="quiet-button">Save guest name</button>}
          {inRoom && <small>Your current table keeps its existing name.</small>}
          {error && <p role="alert">{error}</p>}
          {saved && <output>Name saved.</output>}
        </form>
        <CosmeticEditor
          value={cosmetics}
          theme={theme}
          name={name}
          onSave={onSaveAppearance}
        />
      </div>
    );
  if (view === 'profile' && user)
    return (
      <div className="account-profile">
        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">
            <Avatar id={cosmetics.avatar} />
          </span>
          <div>
            <span className="eyebrow">AT HOME AT THE TABLE</span>
            <h3>{user.name}</h3>
            <span className="profile-status">
              <ShieldCheck size={14} />
              Signed in
            </span>
          </div>
        </div>
        <dl className="profile-facts">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Joined MOVO</dt>
            <dd>
              {new Date(user.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </dd>
          </div>
          <div>
            <dt>Email status</dt>
            <dd>{user.emailVerified ? 'Verified' : 'Not verified'}</dd>
          </div>
        </dl>
        <form className="account-form" onSubmit={submit} noValidate>
          <label>
            Display name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="username"
              maxLength={18}
              required
            />
          </label>
          {inRoom && (
            <small>
              Your current table keeps its existing name. This name is for your
              next room.
            </small>
          )}
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <output className="account-saved">
              <Check size={14} />
              Profile updated.
            </output>
          )}
          <button className="quiet-button" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
        <CosmeticEditor
          value={cosmetics}
          theme={theme}
          name={name}
          onSave={onSaveAppearance}
        />
        <button className="text-button account-signout" onClick={onSignOut}>
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    );
  const signup = view === 'signup';
  return (
    <form className="account-form" onSubmit={submit} noValidate>
      <div className="account-form-top">
        <span className="account-avatar-mini" aria-hidden="true">
          ◆
        </span>
        <span>
          {signup ? 'YOUR NAME. YOUR NEXT RIVALRY.' : 'GOOD TO HAVE YOU BACK.'}
        </span>
      </div>
      {signup && (
        <label>
          Display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="username"
            placeholder="Your table name"
            maxLength={18}
            required
          />
        </label>
      )}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          maxLength={254}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={signup ? 'new-password' : 'current-password'}
          maxLength={128}
          aria-describedby={signup ? 'password-help' : undefined}
          required
        />
      </label>
      {signup && (
        <>
          <small id="password-help">
            Use 12–128 characters. A memorable passphrase works well.
          </small>
          <label>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              maxLength={128}
              required
            />
          </label>
        </>
      )}
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      <button className="primary-button" disabled={busy}>
        {busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}
        <ArrowRight size={18} />
      </button>
      <p className="account-switch">
        {signup ? 'Already have a seat?' : 'New to MOVO?'}{' '}
        <button
          type="button"
          onClick={() => onView(signup ? 'signin' : 'signup')}
        >
          {signup ? 'Sign in' : 'Create account'}
        </button>
      </p>
      <button
        type="button"
        className="text-button account-guest"
        onClick={onGuest}
      >
        Continue as guest
      </button>
    </form>
  );
}

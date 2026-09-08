'use client';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SyntheticEvent,
} from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Crown,
  Eye,
  LockKeyhole,
  LogOut,
  Settings2,
  Shield,
  UnlockKeyhole,
  Users,
  Volume2,
  X,
  CircleHelp,
  WifiOff,
  Trophy,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '../ui/dialog';
import { useGame } from '../../hooks/use-game';
import { Board } from './Board';
import ConnectionPause, { ConnectionLabel } from './ConnectionPause';
import { Die } from './Die';
import Landing from './Landing';
import Tutorial from './Tutorial';
import RevengeTutorial from './RevengeTutorial';
import Chat, { SeatReaction } from './Chat';
import AccountPanel, { AccountMenu } from './Account';
import { accountClient } from '../../lib/account-client';
import { accountError, type AccountView } from '../../shared/account';
import { localPieceNumbers } from '../../shared/turn-presentation';
import { Avatar, BoardSelector, BoardStyleContext } from './Cosmetics';
import {
  boardStyle,
  publicCosmetics,
  type Cosmetics,
  type BoardStyle,
} from '../../shared/cosmetics';
import { COLORS, MARKS, type Seat } from '../../shared/topology';
import { teamForSeat, teamProgress, type Mode } from '../../shared/game';
import type {
  Intent,
  RoomSettings,
  Snapshot,
  Member,
} from '../../shared/protocol';
import { unlockAudio, playSound } from '../../lib/sound';
type Modal =
  | AccountView
  | 'mode'
  | 'play'
  | 'create'
  | 'join'
  | 'settings'
  | 'how'
  | 'leave'
  | null;
type Game = ReturnType<typeof useGame>;
const initialSettings: RoomSettings = {
  mode: 'KNOCKOUT',
  name: 'The evening table',
  capacity: 4,
  private: true,
  timerSeconds: 30,
  spectators: true,
};
const modeName = (mode: Mode) =>
  mode === 'REVENGE'
    ? 'REVENGE'
    : mode === 'KNOCKOUT_2V2'
      ? 'KNOCKOUT 2v2'
      : 'KNOCKOUT';
function useClock() {
  const [time, setTime] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTime(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return time;
}
export default function Movo() {
  const game = useGame(),
    [modal, setModal] = useState<Modal>(null),
    [code, setCode] = useState(''),
    [spectate, setSpectate] = useState(false),
    [config, setConfig] = useState(initialSettings),
    [copied, setCopied] = useState(false);
  const account = accountClient.useSession();
  const accountId = account.data?.user.id,
    accountAvatar = account.data?.user.avatar,
    accountBanner = account.data?.user.banner,
    accountBoard = account.data?.user.boardTheme,
    setPreferences = game.setPrefs;
  useEffect(() => {
    if (accountId)
      setPreferences((p) => ({
        ...p,
        ...publicCosmetics({ avatar: accountAvatar, banner: accountBanner }),
        boardTheme: boardStyle(accountBoard),
      }));
  }, [accountId, accountAvatar, accountBanner, accountBoard, setPreferences]);
  const saveAppearance = async (
    look: Cosmetics & { boardTheme: BoardStyle },
  ): Promise<string | void> => {
    if (account.data?.user) {
      const result = await accountClient.updateUser(look);
      if (result.error) return accountError(result.error.code);
      await accountClient.getSession({ fetchOptions: { cache: 'no-store' } });
    }
    game.setPrefs((p) => ({ ...p, ...look }));
    const result = await game.act({
      type: 'profile',
      cosmetics: publicCosmetics(look),
    });
    if (!result.ok)
      return 'Look saved on this device. Reconnect to update your table card.';
  };
  const [guestChosen, setGuestChosen] = useState(false);
  const [afterIdentity, setAfterIdentity] = useState<
    'play' | 'create' | 'join' | null
  >(null);
  const [afterMode, setAfterMode] = useState<'play' | 'create'>('play');
  const [guideMode, setGuideMode] = useState<Mode>('KNOCKOUT');
  const model = game.display,
    authority = game.snapshot,
    actionRef = useRef(game.act),
    stateRef = useRef(authority);
  useEffect(() => {
    actionRef.current = game.act;
    stateRef.current = authority;
  }, [game.act, authority]);
  const inviteHandled = useRef(false);
  useEffect(() => {
    if (inviteHandled.current || game.status !== 'Connected') return;
    inviteHandled.current = true;
    const match = location.pathname.match(/^\/join\/([^/]+)\/?$/);
    if (match && !authority)
      queueMicrotask(() => {
        setCode(decodeURIComponent(match[1]).slice(0, 5).toUpperCase());
        setModal('join');
      });
  }, [game.status, authority]);
  useEffect(() => {
    type Registry = {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean };
          execute: (input: unknown) => unknown;
        },
        options: { signal: AbortSignal },
      ) => void | Promise<void>;
    };
    const ctx = (document as Document & { modelContext?: Registry })
      .modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    const register = (tool: Parameters<Registry['registerTool']>[0]) => {
      try {
        void Promise.resolve(
          ctx.registerTool(tool, { signal: controller.signal }),
        ).catch(() => {});
      } catch {
        /* Browser extension unavailable. */
      }
    };
    register({
      name: 'movo_read_table',
      title: 'Read MOVO table',
      description:
        'Read this guest’s current public room, turn, pieces and legal moves.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: () => stateRef.current,
    });
    register({
      name: 'movo_roll',
      title: 'Roll MOVO die',
      description:
        'Request an authoritative die roll for the current guest. Only works during their roll phase.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: () => actionRef.current({ type: 'roll' }),
    });
    register({
      name: 'movo_move',
      title: 'Move MOVO piece',
      description:
        'Move one of the current guest’s server-approved legal pieces.',
      inputSchema: {
        type: 'object',
        properties: {
          pieceId: { type: 'string' },
          targetId: { type: 'string' },
          dieId: { type: 'string' },
        },
        required: ['pieceId'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: (input) => {
        const p = input as {
          pieceId?: unknown;
          targetId?: string;
          dieId?: string;
        };
        if (typeof p?.pieceId !== 'string')
          throw new Error('pieceId is required');
        return actionRef.current({
          type: 'move',
          pieceId: p.pieceId,
          targetId: p.targetId,
          dieId: p.dieId,
        });
      },
    });
    return () => controller.abort();
  }, []);
  function open(which: Modal) {
    unlockAudio();
    playSound('ui', game.prefs);
    game.setError('');
    if (which === 'play' || which === 'create' || which === 'join') {
      if (!account.data?.user && !guestChosen) {
        setAfterIdentity(which);
        setModal('entry');
        return;
      }
      if (account.data?.user) game.setGuestName(account.data.user.name);
    }
    if (which === 'play' || which === 'create') {
      setAfterMode(which);
      setModal('mode');
    } else {
      if (which === 'how') setGuideMode(model?.settings.mode ?? config.mode);
      setModal(which);
    }
  }
  function accountOpen(view: AccountView) {
    setAfterIdentity(null);
    setModal(view);
  }
  function continueIdentity(name?: string) {
    if (name) game.setGuestName(name);
    else setGuestChosen(true);
    const next = afterIdentity;
    setAfterIdentity(null);
    if (next === 'play' || next === 'create') {
      setAfterMode(next);
      setModal('mode');
    } else setModal(next ?? (name ? 'profile' : null));
  }
  async function signOut() {
    try {
      const result = await accountClient.signOut();
      if (result.error) {
        game.setError(accountError(result.error.code));
        return;
      }
      setGuestChosen(true);
      setModal(null);
      if (!model) game.setGuestName('Guest');
    } catch {
      game.setError('Connection failed. Please try again.');
    }
  }
  const accountMenu = (
    <AccountMenu
      user={account.data?.user}
      onOpen={accountOpen}
      onSettings={() => open('settings')}
      onSignOut={() => void signOut()}
    />
  );
  async function submit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    unlockAudio();
    const r = await game.act(
      modal === 'create'
        ? { type: 'create', settings: config, name: game.guestName || 'Guest' }
        : modal === 'join'
          ? { type: 'join', code, name: game.guestName || 'Guest', spectate }
          : {
              type: 'quick',
              mode: config.mode,
              name: game.guestName || 'Guest',
            },
    );
    if (r.ok) setModal(null);
  }
  async function copy() {
    if (!model) return;
    const link = `${location.origin}/join/${model.code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      game.setError(`Copy this invite: ${link}`);
    }
  }
  const run = async (intent: Omit<Intent, 'v' | 'requestId'>) => {
    unlockAudio();
    playSound('ui', game.prefs);
    return game.act(intent);
  };
  return (
    <BoardStyleContext.Provider value={game.prefs.boardTheme}>
      {!model ? (
        <Landing
          onPlay={open}
          onHow={() => open('how')}
          onSettings={() => open('settings')}
          accountMenu={accountMenu}
        />
      ) : (
        <main
          className={`app-shell game-shell ${game.prefs.reduced ? 'reduce-motion' : ''}`}
        >
          <header className="site-header game-header">
            <button
              className="wordmark brand-button"
              onClick={() => open('leave')}
              aria-label="MOVO home"
            >
              movo<span>®</span>
            </button>
            <div className="game-mode">
              {modeName(model.settings.mode)}{' '}
              <span>
                {model.settings.mode === 'REVENGE'
                  ? 'WINNING ISN’T SAFE.'
                  : 'NO KNOCK. NO HOME.'}
              </span>
            </div>
            <div className="header-actions">
              {accountMenu}
              <button
                className="icon-button"
                aria-label="How to play"
                onClick={() => open('how')}
              >
                <CircleHelp size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Settings"
                onClick={() => open('settings')}
              >
                <Settings2 size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="Leave room"
                onClick={() => open('leave')}
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
          <div className="room-bar">
            <div>
              <span className="status-dot" />
              <span>{model.settings.name}</span>
              <small>
                {model.settings.private ? 'PRIVATE TABLE' : 'OPEN TABLE'}
              </small>
            </div>
            <button
              className="room-code"
              onClick={copy}
              aria-label="Copy invite link"
            >
              <span>ROOM</span> <b>{model.code}</b>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          {model.match ? (
            <MatchTable
              game={game}
              onAction={run}
              onLeave={() => open('leave')}
              onHow={() => open('how')}
            />
          ) : (
            <Lobby
              model={model}
              busy={game.pending}
              onAction={run}
              onInvite={copy}
              copied={copied}
            />
          )}
        </main>
      )}
      {game.status !== 'Connected' && model && (
        <output className="connection-banner">
          <WifiOff size={15} /> {game.status} · Your seat is reserved for 90
          seconds.
        </output>
      )}
      {game.error && !modal && (
        <div className="error-toast" role="alert">
          <span>{game.error}</span>
          {game.status === 'Offline' ? (
            <button onClick={game.retry}>Reconnect</button>
          ) : (
            <button
              aria-label="Dismiss error"
              onClick={() => game.setError('')}
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}
      <Dialog
        open={modal !== null}
        onOpenChange={(v) => {
          if (!v) setModal(null);
        }}
      >
        <DialogContent
          className={`movo-dialog ${modal === 'how' ? 'tutorial-dialog' : ''} ${['entry', 'signin', 'signup', 'profile'].includes(modal ?? '') ? 'account-dialog' : ''}`}
        >
          <div className="dialog-brand">
            movo
            <span>
              {' '}
              / {modal === 'how' ? modeName(guideMode) : 'THE TABLE'}
            </span>
          </div>
          <DialogTitle className="dialog-title">
            {modal === 'entry'
              ? 'Pull up a seat.'
              : modal === 'signin'
                ? 'Welcome back.'
                : modal === 'signup'
                  ? 'Make it your table.'
                  : modal === 'profile'
                    ? 'Your player profile.'
                    : modal === 'mode'
                      ? 'Choose your mode.'
                      : modal === 'create'
                        ? 'Make room for rivalry.'
                        : modal === 'join'
                          ? 'Pull up a seat.'
                          : modal === 'play'
                            ? 'Your table is waiting.'
                            : modal === 'settings'
                              ? 'Make yourself at home.'
                              : modal === 'leave'
                                ? 'Leaving the table?'
                                : 'HOW TO PLAY MOVO'}
          </DialogTitle>
          <DialogDescription className="dialog-description">
            {modal === 'entry'
              ? 'Play now, or bring your MOVO account.'
              : modal === 'signin'
                ? 'Sign in to your MOVO account.'
                : modal === 'signup'
                  ? 'A familiar name for every game night.'
                  : modal === 'profile'
                    ? 'A little identity. Plenty of rivalry.'
                    : modal === 'mode'
                      ? 'Your rivals, or your rivals and a teammate.'
                      : modal === 'play'
                        ? 'Join an open table with another player.'
                        : modal === 'create'
                          ? 'Set the table, then pass the invite.'
                          : modal === 'join'
                            ? 'Enter a room code or paste an invite link.'
                            : modal === 'settings'
                              ? 'A few small things, just the way you like them.'
                              : modal === 'leave'
                                ? model?.match?.phase === 'PLAYING'
                                  ? 'Leaving an active match forfeits your seat.'
                                  : 'You can rejoin the lobby with its room code.'
                                : guideMode === 'REVENGE'
                                  ? 'WINNING ISN’T SAFE. · Your visual Revenge guide.'
                                  : 'ROLL. KNOCK. GET HOME. · A 90-second table guide.'}
          </DialogDescription>
          {['entry', 'signin', 'signup', 'profile'].includes(modal ?? '') && (
            <AccountPanel
              key={`${modal}-${account.data?.user.id ?? 'guest'}`}
              view={modal as AccountView}
              user={account.data?.user}
              loading={account.isPending}
              onView={setModal}
              onGuest={() => continueIdentity()}
              onAuthenticated={continueIdentity}
              onSignOut={() => void signOut()}
              inRoom={Boolean(model)}
              cosmetics={publicCosmetics(game.prefs)}
              theme={game.prefs.boardTheme}
              guestName={game.guestName}
              onSaveAppearance={saveAppearance}
              onSaveGuestName={async (name) => {
                if (!name.trim() || name.trim().length > 18)
                  return 'Choose a display name of 1–18 characters.';
                const result = await game.act({
                  type: 'profile',
                  name: name.trim(),
                });
                if (!result.ok)
                  return result.error ?? 'Could not save your name.';
              }}
            />
          )}
          {modal === 'mode' && (
            <div className="mode-selector">
              {(['KNOCKOUT', 'KNOCKOUT_2V2'] as Mode[]).map((mode, i) => (
                <button
                  key={mode}
                  className="mode-choice"
                  onClick={() => {
                    setConfig({
                      ...config,
                      mode,
                      capacity: mode === 'KNOCKOUT_2V2' ? 4 : config.capacity,
                    });
                    setModal(afterMode);
                  }}
                >
                  <span className="mode-number">0{i + 1}</span>
                  <span className="mode-choice-copy">
                    <b>{i ? 'KNOCKOUT 2v2' : 'KNOCKOUT'}</b>
                    <span>
                      {i ? 'TEAM UP. KNOCK. GET HOME.' : 'NO KNOCK. NO HOME.'}
                    </span>
                    <small>
                      {i
                        ? '4 PLAYERS · TWO TEAMS'
                        : '2–4 PLAYERS · EVERY PIECE FOR ITSELF'}
                    </small>
                  </span>
                  <span className="mode-play">
                    PLAY <ArrowRight size={18} />
                  </span>
                </button>
              ))}
              <div className="mode-choice revenge-choice">
                <span className="mode-number">03</span>
                <span className="mode-choice-copy">
                  <b>REVENGE</b>
                  <span>WINNING ISN’T SAFE.</span>
                  <small>2 VS 2 · HALKI</small>
                </span>
                <div className="revenge-card-actions">
                  <button
                    className="mode-play"
                    onClick={() => {
                      setConfig({ ...config, mode: 'REVENGE', capacity: 4 });
                      setModal(afterMode);
                    }}
                  >
                    PLAY <ArrowRight size={18} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setGuideMode('REVENGE');
                      setModal('how');
                    }}
                  >
                    HOW TO PLAY
                  </button>
                </div>
              </div>
            </div>
          )}
          {['play', 'create', 'join'].includes(modal ?? '') && (
            <form className="room-form" onSubmit={submit}>
              {modal !== 'join' && (
                <button
                  type="button"
                  className="selected-mode"
                  onClick={() => {
                    setAfterMode(modal === 'create' ? 'create' : 'play');
                    setModal('mode');
                  }}
                >
                  {modeName(config.mode)} ·{' '}
                  {config.mode === 'KNOCKOUT' ? '2–4' : '4'} players{' '}
                  <span>Change</span>
                </button>
              )}
              <label>
                Your name
                <input
                  maxLength={18}
                  value={game.guestName}
                  onChange={(e) => game.setGuestName(e.target.value)}
                  placeholder="Pick your table name"
                  autoComplete="off"
                  required
                />
              </label>
              {modal === 'create' && (
                <>
                  <label>
                    Room name
                    <input
                      maxLength={32}
                      value={config.name}
                      onChange={(e) =>
                        setConfig({ ...config, name: e.target.value })
                      }
                      required
                    />
                  </label>
                  <div className="form-row">
                    <fieldset>
                      <legend>Players</legend>
                      <div className="segmented">
                        {(config.mode !== 'KNOCKOUT'
                          ? ([4] as const)
                          : ([2, 3, 4] as const)
                        ).map((n) => (
                          <button
                            type="button"
                            key={n}
                            aria-pressed={config.capacity === n}
                            onClick={() =>
                              setConfig({ ...config, capacity: n })
                            }
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <label>
                      Turn timer
                      <select
                        value={config.timerSeconds}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            timerSeconds: Number(
                              e.target.value,
                            ) as RoomSettings['timerSeconds'],
                          })
                        }
                      >
                        <option value={0}>Off</option>
                        <option value={15}>15 seconds</option>
                        <option value={30}>30 seconds</option>
                        <option value={45}>45 seconds</option>
                      </select>
                    </label>
                  </div>
                  <label className="check-row">
                    <span>
                      <LockKeyhole size={16} /> Private room
                    </span>
                    <input
                      type="checkbox"
                      checked={config.private}
                      onChange={(e) =>
                        setConfig({ ...config, private: e.target.checked })
                      }
                    />
                  </label>
                  <label className="check-row">
                    <span>
                      <Eye size={16} /> Allow spectators
                    </span>
                    <input
                      type="checkbox"
                      checked={config.spectators}
                      onChange={(e) =>
                        setConfig({ ...config, spectators: e.target.checked })
                      }
                    />
                  </label>
                </>
              )}
              {modal === 'join' && (
                <>
                  <label>
                    Room code or invite
                    <input
                      value={code}
                      onChange={(e) => {
                        const value = e.target.value;
                        setCode(
                          value.includes('/join/')
                            ? value
                                .split('/join/')
                                .pop()!
                                .split(/[?#]/)[0]
                                .slice(0, 5)
                                .toUpperCase()
                            : value.toUpperCase().slice(0, 5),
                        );
                      }}
                      placeholder="AB7K2"
                      autoCapitalize="characters"
                      required
                      pattern="[A-Z2-9]{5}"
                    />
                    <small>Five characters. Big consequences.</small>
                  </label>
                  <label className="check-row">
                    <span>
                      <Eye size={16} /> Join as a spectator
                    </span>
                    <input
                      type="checkbox"
                      checked={spectate}
                      onChange={(e) => setSpectate(e.target.checked)}
                    />
                  </label>
                </>
              )}
              {modal === 'play' && (
                <div className="play-options">
                  <Users size={24} />
                  <div>
                    <strong>A real seat. A real rival.</strong>
                    <p>
                      We’ll join an available public room, or open one for the
                      next player.
                    </p>
                  </div>
                </div>
              )}
              <button
                className="primary-button full"
                disabled={game.pending || game.status !== 'Connected'}
              >
                {game.pending
                  ? 'Taking your seat…'
                  : game.status !== 'Connected'
                    ? 'Connecting to the table…'
                    : modal === 'create'
                      ? 'Create room'
                      : modal === 'join'
                        ? spectate
                          ? 'Watch the table'
                          : 'Join room'
                        : 'Quick play'}
                <ArrowRight size={19} />
              </button>
              {modal === 'play' && (
                <div className="dialog-secondary">
                  <button type="button" onClick={() => setModal('create')}>
                    Create a private room
                  </button>
                  <button type="button" onClick={() => setModal('join')}>
                    Have a code?
                  </button>
                </div>
              )}
              <div className="form-footnote">
                FREE TO PLAY <span>·</span> NO ACCOUNT NEEDED
              </div>
            </form>
          )}
          {modal === 'settings' && (
            <div className="room-form">
              <BoardSelector
                value={game.prefs.boardTheme}
                onChange={(boardTheme) =>
                  void saveAppearance({
                    ...publicCosmetics(game.prefs),
                    boardTheme,
                  }).then((error) => {
                    if (error) game.setError(error);
                  })
                }
              />
              <button
                className="quiet-button"
                onClick={() => setModal('profile')}
              >
                Edit avatar & banner
              </button>
              <label className="check-row">
                <span>
                  <Volume2 size={16} /> Sound effects
                </span>
                <input
                  type="checkbox"
                  checked={!game.prefs.mute}
                  onChange={(e) => {
                    unlockAudio();
                    game.setPrefs({ ...game.prefs, mute: !e.target.checked });
                  }}
                />
              </label>
              <label>
                Master volume{' '}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={game.prefs.master}
                  onChange={(e) =>
                    game.setPrefs({
                      ...game.prefs,
                      master: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Effects volume{' '}
                <input
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={game.prefs.sfx}
                  onChange={(e) => {
                    game.setPrefs({
                      ...game.prefs,
                      sfx: Number(e.target.value),
                    });
                    playSound('hop', {
                      ...game.prefs,
                      sfx: Number(e.target.value),
                    });
                  }}
                />
              </label>
              <button
                className="quiet-button"
                onClick={() => {
                  unlockAudio();
                  playSound('diceRoll', game.prefs);
                }}
              >
                Preview dice sound
              </button>
              <fieldset className="motion-setting">
                <legend>Reduced Motion</legend>
                <div className="segmented">
                  {[false, true].map((reduced) => (
                    <button
                      key={String(reduced)}
                      type="button"
                      aria-pressed={game.prefs.reduced === reduced}
                      onClick={() => game.setPrefs({ ...game.prefs, reduced })}
                    >
                      {reduced ? 'ON' : 'OFF'}
                    </button>
                  ))}
                </div>
                <small>
                  {game.prefs.reduced
                    ? 'Quick transitions and minimal effects.'
                    : 'Full dice rolls and square-by-square movement.'}
                </small>
              </fieldset>
              <label className="check-row">
                <span>Light haptics, when supported</span>
                <input
                  type="checkbox"
                  checked={game.prefs.haptics}
                  onChange={(e) =>
                    game.setPrefs({ ...game.prefs, haptics: e.target.checked })
                  }
                />
              </label>
              <label className="check-row">
                <span>First-match hints</span>
                <input
                  type="checkbox"
                  checked={game.prefs.hints}
                  onChange={(e) =>
                    game.setPrefs({ ...game.prefs, hints: e.target.checked })
                  }
                />
              </label>
              <button
                className="primary-button full"
                onClick={() => setModal(null)}
              >
                Back to the table <Check size={18} />
              </button>
            </div>
          )}
          {modal === 'leave' && (
            <div className="leave-actions">
              <button className="primary-button" onClick={() => setModal(null)}>
                Stay and play
              </button>
              <button
                className="quiet-button"
                disabled={game.pending}
                onClick={async () => {
                  const r = await run({ type: 'leave' });
                  if (r.ok) {
                    setModal(null);
                    history.replaceState(null, '', '/');
                  }
                }}
              >
                Leave room
              </button>
            </div>
          )}
          {modal === 'how' && (
            <>
              <div
                className="guide-mode-tabs"
                role="tablist"
                aria-label="Rules mode"
              >
                {(['KNOCKOUT', 'KNOCKOUT_2V2', 'REVENGE'] as Mode[]).map(
                  (mode) => (
                    <button
                      key={mode}
                      role="tab"
                      aria-selected={guideMode === mode}
                      onClick={() => setGuideMode(mode)}
                    >
                      {modeName(mode)}
                    </button>
                  ),
                )}
              </div>
              {guideMode === 'REVENGE' ? (
                <RevengeTutorial
                  reduced={game.prefs.reduced}
                  onDone={() => setModal(null)}
                />
              ) : (
                <Tutorial
                  key={guideMode}
                  reduced={game.prefs.reduced}
                  onDone={() => setModal(null)}
                />
              )}
            </>
          )}
          {game.error && (
            <div className="inline-error" role="alert">
              {game.error}
              {game.status === 'Offline' && (
                <button className="text-button" onClick={game.retry}>
                  {game.error.includes('expired')
                    ? 'Start a new guest session'
                    : 'Reconnect'}
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </BoardStyleContext.Provider>
  );
}
function Badge({ member, model }: { member: Member; model: Snapshot }) {
  const p = model.match?.players.find((p) => p.id === member.id),
    home =
      model.match?.pieces.filter(
        (p) => p.ownerId === member.id && p.position.kind === 'HOME',
      ).length ?? 0;
  const active =
    !model.pause &&
    model.match?.phase === 'PLAYING' &&
    model.match.currentPlayerId === member.id;
  return (
    <div
      className={`player-badge premium-player banner-${publicCosmetics(member.cosmetics).banner} seat-${member.seat} ${active ? 'active' : ''} ${p?.forfeited ? 'forfeited' : ''} ${model.settings.mode === 'REVENGE' && model.match ? 'revenge-player' : ''}`}
      style={{ '--player': COLORS[member.seat ?? 0] } as CSSProperties}
    >
      <div className="player-avatar" aria-hidden="true">
        <Avatar id={publicCosmetics(member.cosmetics).avatar} />
        <span className="seat-color-mark">{MARKS[member.seat ?? 0]}</span>
      </div>
      <SeatReaction
        reaction={model.reactions?.find((r) => r.playerId === member.id)}
        serverNow={model.serverNow}
      />
      <div className="player-details">
        {active && (
          <span className="turn-chip">
            {member.id === model.selfId ? 'YOUR TURN' : 'PLAYING'}
          </span>
        )}
        <strong>
          <span className="player-name" title={member.name}>
            {member.name}
          </span>
          {member.connected && (
            <span
              className="connection-dot"
              title="Connected"
              aria-label="Connected"
            />
          )}
          {model.settings.mode !== 'KNOCKOUT' && (
            <span className="team-badge">{teamForSeat(member.seat!)}</span>
          )}
          <span>
            {member.id === model.selfId ? (
              'YOU'
            ) : member.id === model.hostId ? (
              <Crown size={10} />
            ) : (
              ''
            )}
          </span>
        </strong>
        <div className="player-sub">
          {!member.connected ? (
            <ConnectionLabel member={member} model={model} />
          ) : !model.match ? (
            <span className={member.ready ? 'ready-label' : ''}>
              {member.ready ? 'READY' : 'GETTING READY'}
            </span>
          ) : (
            <>
              <span className="knock-count">{p?.knocked ?? 0} K</span>
              <div
                className="home-progress"
                aria-label={`${home} of four pieces home`}
              >
                {home}/4
              </div>
              <span>
                {model.settings.mode === 'REVENGE' ? (
                  <>
                    {model.match.revenge?.support[member.id]
                      ? model.match.revenge.support[member.id].ready
                        ? 'SUPPORT READY'
                        : `SUPPORT IN ${model.match.revenge.support[member.id].rotationsLeft}`
                      : p?.homeUnlocked
                        ? 'HOME OPEN'
                        : 'NEED 1 KNOCK'}
                  </>
                ) : (
                  <>
                    {p?.homeUnlocked ? (
                      <>
                        <UnlockKeyhole size={10} /> HOME
                      </>
                    ) : (
                      <>
                        <LockKeyhole size={10} /> HOME
                      </>
                    )}
                  </>
                )}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
function Lobby({
  model,
  busy,
  onAction,
  onInvite,
  copied,
}: {
  model: Snapshot;
  busy: boolean;
  onAction: (i: Omit<Intent, 'v' | 'requestId'>) => Promise<unknown>;
  onInvite: () => void;
  copied: boolean;
}) {
  const me = model.members.find((m) => m.id === model.selfId)!,
    host = model.hostId === model.selfId,
    players = model.members.filter((m) => m.seat !== null),
    ready =
      players.length === model.settings.capacity &&
      players.every((m) => m.ready && m.connected);
  const seats: Seat[] =
    model.settings.capacity === 2
      ? [0, 2]
      : model.settings.capacity === 3
        ? [0, 1, 2]
        : [0, 1, 2, 3];
  return (
    <section className="lobby">
      <div className="lobby-heading">
        <span className="eyebrow">THE PRE-GAME</span>
        <h1>A good night starts here.</h1>
        <p>
          {players.length} of {model.settings.capacity} seats taken. Bring your
          favorite rivals.
        </p>
      </div>
      <div className="lobby-table">
        <div className="lobby-board">
          <Board
            pieces={[]}
            label={`MOVO ${modeName(model.settings.mode)} board`}
            revengeMode={model.settings.mode === 'REVENGE'}
            unlocked={[]}
          />
        </div>
        <div className="lobby-center">
          <span className="wordmark">movo</span>
          <span>{modeName(model.settings.mode)}</span>
          <p>
            {ready ? 'EVERYONE’S HERE. GAME ON?' : 'WAITING FOR YOUR PEOPLE'}
          </p>
          <button className="invite-button" onClick={onInvite}>
            {copied ? <Check size={16} /> : <Copy size={16} />}{' '}
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
        </div>
        {seats.map((seat) => {
          const m = players.find((m) => m.seat === seat);
          return m ? (
            <Badge key={seat} member={m} model={model} />
          ) : (
            <button
              key={seat}
              className={`empty-seat seat-${seat}`}
              onClick={onInvite}
            >
              <span>+</span>
              <strong>Save a seat</strong>
              <small>Invite a friend</small>
            </button>
          );
        })}
      </div>
      {model.settings.mode !== 'KNOCKOUT' && (
        <div className="lobby-teams">
          {(['A', 'B'] as const).map((team) => (
            <div key={team}>
              <b>TEAM {team}</b>
              <span>
                {players
                  .filter((p) => teamForSeat(p.seat!) === team)
                  .map((p) => p.name)
                  .join(' + ') || 'Seats open'}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="lobby-controls">
        {host && model.settings.mode !== 'KNOCKOUT' && (
          <button
            className="quiet-button"
            disabled={busy || players.length !== 4}
            onClick={() => onAction({ type: 'randomize' })}
          >
            Randomize teams
          </button>
        )}
        {me.seat !== null && (
          <button
            className={me.ready ? 'ready-button' : 'primary-button'}
            disabled={busy}
            onClick={() => onAction({ type: 'ready', ready: !me.ready })}
          >
            {me.ready ? <Check size={18} /> : <Users size={18} />}{' '}
            {me.ready ? 'You’re ready' : 'I’m ready'}
          </button>
        )}
        {host && (
          <button
            className="primary-button"
            disabled={busy || !ready}
            onClick={() => onAction({ type: 'start' })}
          >
            Start game <ArrowRight size={18} />
          </button>
        )}
        {me.seat === null && (
          <span className="spectator-note">
            <Eye size={16} /> You have a front-row seat.
          </span>
        )}
      </div>
      <div className="lobby-footnote">
        <Shield size={13} />
        <span>
          {model.settings.timerSeconds
            ? `${model.settings.timerSeconds}s turns`
            : 'No turn timer'}{' '}
          · {model.settings.spectators ? 'Spectators welcome' : 'Players only'}{' '}
          · All rolls are fair
        </span>
      </div>
      {host && players.length > 1 && (
        <details className="host-controls">
          <summary>Manage seats</summary>
          {players
            .filter((p) => p.id !== model.selfId)
            .map((p) => (
              <div key={p.id}>
                <span>{p.name}</span>
                <button
                  disabled={busy || !p.connected}
                  onClick={() => onAction({ type: 'transfer', targetId: p.id })}
                >
                  Make host
                </button>
                <button
                  disabled={busy}
                  onClick={() => onAction({ type: 'kick', targetId: p.id })}
                >
                  Remove
                </button>
              </div>
            ))}
        </details>
      )}
    </section>
  );
}
function MatchTable({
  game,
  onAction,
  onLeave,
  onHow,
}: {
  game: Game;
  onAction: (i: Omit<Intent, 'v' | 'requestId'>) => Promise<unknown>;
  onLeave: () => void;
  onHow: () => void;
}) {
  const model = game.display!,
    match = model.match!,
    auth = game.snapshot!.match!,
    me = match.players.find((p) => p.id === model.selfId),
    active = match.players.find((p) => p.id === auth.currentPlayerId),
    time = useClock();
  const [inspection, setInspection] = useState('');
  const [selectedDie, setSelectedDie] = useState<string | null>(null);
  const [linked, setLinked] = useState<{ id: string; revision: number } | null>(
    null,
  );
  const [selectedHalki, setSelectedHalki] = useState<{
    revision: number;
    id: string;
  } | null>(null);
  const beneficiary = auth.revenge?.beneficiaryId ?? auth.currentPlayerId;
  const helper = beneficiary !== auth.currentPlayerId;
  const beneficiaryName = auth.players.find((p) => p.id === beneficiary)?.name;
  const canAct =
    !game.snapshot!.pause &&
    !game.busy &&
    !game.pending &&
    game.status === 'Connected' &&
    auth.phase === 'PLAYING' &&
    !auth.revenge?.rulePending;
  const canPlay = canAct && beneficiary === model.selfId;
  const canRoll = canAct && auth.currentPlayerId === model.selfId;
  const allMoves = canPlay ? game.snapshot!.legal : [];
  const turnDice = auth.revenge?.turnDice ?? [];
  const dieOptions = turnDice.filter((d) => d.status === 'available');
  const chosenDie =
    dieOptions.find(
      (d) =>
        d.id === selectedDie &&
        allMoves.some((m) => m.dieId === d.id && m.action !== 'activate'),
    ) ??
    dieOptions.find((d) =>
      allMoves.some((m) => m.dieId === d.id && m.action !== 'activate'),
    ) ??
    dieOptions[0];
  const moves = auth.revenge
    ? allMoves.filter(
        (m) => m.action === 'activate' || m.dieId === chosenDie?.id,
      )
    : allMoves;
  const linkedId = linked?.revision === auth.revision ? linked.id : undefined;
  const numbered = localPieceNumbers(auth, model.selfId);
  const linkPiece = (id: string | null) =>
    setLinked(id ? { id, revision: auth.revision } : null);
  const remaining = game.snapshot!.pause
    ? game.snapshot!.pause.remainingMs === null
      ? null
      : Math.ceil(game.snapshot!.pause.remainingMs / 1000)
    : auth.deadline
      ? Math.max(
          0,
          Math.ceil(
            (auth.deadline -
              (time ? time + game.clockOffset : model.serverNow)) /
              1000,
          ),
        )
      : null;
  const move = (id: string) => {
    if (moves.some((m) => m.pieceId === id && m.action === 'activate')) {
      setSelectedHalki({ id, revision: auth.revision });
      return;
    }
    void onAction({
      type: 'move',
      pieceId: id,
      ...(auth.revenge ? { dieId: chosenDie?.id } : {}),
    });
  };
  const activations = moves.filter((m) => m.action === 'activate');
  const selected =
    selectedHalki?.revision === auth.revision
      ? selectedHalki.id
      : activations[0]?.pieceId;
  if (match.phase === 'FINISHED' && !game.busy)
    return (
      <Results
        model={model}
        onAction={onAction}
        onLeave={onLeave}
        pending={game.pending}
      />
    );
  return (
    <section
      className={`match-table ${game.snapshot!.pause ? 'table-paused' : ''} ${game.effect} ${auth.revenge ? 'revenge-turn-table' : ''}`}
    >
      {!game.snapshot!.pause &&
        auth.currentPlayerId === model.selfId &&
        auth.phase === 'PLAYING' && (
          <output
            key={`${auth.id}:${auth.turnNumber}`}
            className="turn-start-cue"
          >
            YOUR TURN{' '}
            <span>
              {helper
                ? 'Roll for your teammate'
                : auth.revenge
                  ? 'Roll, then use your dice'
                  : 'Make your next move'}
            </span>
          </output>
        )}
      {match.mode !== 'KNOCKOUT' && (
        <div className="team-score" aria-label="Team progress">
          {(['A', 'B'] as const).map((team) => (
            <span key={team}>
              <b>TEAM {team}</b>
              <i>
                {match.players
                  .filter((p) => p.team === team)
                  .map((p) => (
                    <em
                      key={p.id}
                      style={{ backgroundColor: COLORS[p.seat] }}
                    />
                  ))}
              </i>
              <strong>
                {teamProgress(match, team)} <small>/ 8 HOME</small>
              </strong>
            </span>
          ))}
        </div>
      )}
      <div className="match-topline">
        <span>ROUND {auth.turnNumber.toString().padStart(2, '0')}</span>
        <span>
          {me ? 'YOUR RIVALS ARE WAITING.' : 'SPECTATOR · ENJOY THE RIVALRY'}
        </span>
        <button aria-label="Board rules" onClick={onHow}>
          <CircleHelp size={15} />
        </button>
      </div>
      <div className="table-frame">
        <div className="table-board">
          <Board
            pieces={match.pieces.filter(
              (p) => !match.players.find((o) => o.id === p.ownerId)!.forfeited,
            )}
            positions={game.positions}
            motion={game.motion}
            captureMotions={game.captureMotions}
            impact={game.impact}
            effectSeat={game.effectSeat}
            onInspect={setInspection}
            revenge={match.revenge}
            label={
              match.mode === 'REVENGE'
                ? 'MOVO Revenge board'
                : 'MOVO Knockout board'
            }
            targets={activations
              .filter((m) => m.pieceId === selected)
              .map((m) => m.path.at(-1)!)}
            eligible={
              match.mode === 'REVENGE'
                ? match.pieces
                    .filter(
                      (p) =>
                        p.position.kind === 'HOME' &&
                        p.hasUsedHalki === false &&
                        !match.revenge?.secured.includes(p.ownerId),
                    )
                    .map((p) => p.id)
                : []
            }
            legal={moves.map((m) => m.pieceId)}
            numbered={numbered}
            linkedPiece={linkedId}
            onLink={auth.revenge ? linkPiece : undefined}
            interactionKey={auth.revision}
            onMove={move}
            unlocked={match.players
              .filter((p) => p.homeUnlocked)
              .map((p) => p.seat)}
            active={
              match.players.find((p) => p.id === auth.currentPlayerId)?.seat
            }
            effect={game.effect}
          />
        </div>
        {model.members
          .filter((m) => m.seat !== null)
          .map((m) => (
            <Badge
              key={m.id}
              member={m}
              model={{
                ...model,
                reactions: game.snapshot!.reactions,
                serverNow: game.snapshot!.serverNow,
                match: { ...match, currentPlayerId: auth.currentPlayerId },
              }}
            />
          ))}
      </div>
      <div className="action-dock">
        <div className="turn-label">
          <span className="eyebrow">
            {helper
              ? `${active?.name.toUpperCase()}’S SUPPORT TURN`
              : auth.currentPlayerId === model.selfId
                ? 'YOUR TURN'
                : `${active?.name.toUpperCase()}’S TURN`}
          </span>
          <strong>
            {game.snapshot!.pause
              ? 'Table paused.'
              : game.busy
                ? 'Watch the table.'
                : auth.revenge?.halkiChoice
                  ? auth.revenge.halkiChoice.required
                    ? 'HALKI REQUIRED.'
                    : 'HALKI AVAILABLE.'
                  : auth.revenge?.rollPending && auth.revenge.turnDice.length
                    ? 'Six! Roll again.'
                    : canPlay && auth.dice !== null
                      ? auth.revenge
                        ? `Use your ${chosenDie?.value ?? auth.dice}.`
                        : 'Make your move.'
                      : canRoll
                        ? 'Let it roll.'
                        : 'A little patience.'}
          </strong>
          {helper && (
            <small className="helper-label">
              HELPING {beneficiaryName?.toUpperCase()} ·{' '}
              {beneficiary === model.selfId
                ? 'YOU CHOOSE THE PIECE'
                : `${beneficiaryName} chooses the piece`}
            </small>
          )}
          {remaining !== null && (
            <span className={`turn-clock ${remaining <= 5 ? 'urgent' : ''}`}>
              {remaining}s{game.snapshot!.pause ? ' · PAUSED' : ''}
            </span>
          )}
        </div>
        <Die
          value={game.die}
          disabled={
            !canRoll ||
            (auth.revenge ? !auth.revenge.rollPending : auth.dice !== null)
          }
          rolling={
            game.effect === 'dice-rolling' ||
            (game.pending && auth.dice === null)
          }
          onRoll={() => {
            void onAction({ type: 'roll' });
          }}
        />
        <div className="home-status">
          {auth.revenge ? (
            <div>
              <strong>
                {me?.homeUnlocked
                  ? 'HOME UNLOCKED'
                  : 'HOME LOCKED · NEED 1 KNOCK'}
              </strong>
              <span>
                {auth.revenge.rollPending
                  ? 'SIX = ANOTHER ROLL'
                  : 'USE EACH DIE SEPARATELY'}
              </span>
            </div>
          ) : (
            <>
              {me?.homeUnlocked ? (
                <UnlockKeyhole size={17} />
              ) : (
                <LockKeyhole size={17} />
              )}
              <div>
                <strong>
                  {me?.homeUnlocked ? 'HOME UNLOCKED' : 'NO KNOCK. NO HOME.'}
                </strong>
                <span>
                  {me?.homeUnlocked
                    ? 'All four pieces can go home.'
                    : 'Land on a rival to unlock home.'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
      {auth.revenge && (
        <div className="turn-dice" aria-label="Turn rolls">
          <div>
            <strong>{turnDice.length ? 'TURN ROLLS' : 'PREVIOUS TURN'}</strong>
            <span>
              {turnDice.length
                ? auth.revenge.rollPending
                  ? 'Roll your bonus, then choose your moves.'
                  : 'Choose an available die, then a piece.'
                : (auth.players.find(
                    (p) => p.id === auth.revenge?.previousTurn?.playerId,
                  )?.name ?? 'Roll to begin.')}
            </span>
          </div>
          <div className="dice-pool">
            {(turnDice.length
              ? turnDice
              : (auth.revenge.previousTurn?.dice ?? [])
            ).map((d, i) => (
              <button
                key={d.id}
                className={`pool-die ${d.status} ${auth.revenge!.halkiChoice?.dieIds.includes(d.id) ? 'halki-pair-die' : ''}`}
                aria-label={`Die ${i + 1}: ${d.value}, ${d.status}`}
                aria-pressed={turnDice.length > 0 && chosenDie?.id === d.id}
                disabled={
                  !canPlay ||
                  auth.revenge!.rollPending ||
                  !allMoves.some(
                    (m) => m.dieId === d.id && m.action !== 'activate',
                  )
                }
                onClick={() => {
                  setSelectedDie(d.id);
                  setLinked(null);
                }}
              >
                <b>{d.value}</b>
                {auth.revenge!.halkiChoice?.dieIds.includes(d.id) && (
                  <span className="pair-marker">↔ HALKI PAIR</span>
                )}
                <small>
                  {d.status === 'used'
                    ? '✓ USED'
                    : d.status === 'halki'
                      ? '✓ HALKI'
                      : d.status === 'unplayable'
                        ? 'NO MOVE'
                        : d.status === 'ended'
                          ? 'TURN ENDED'
                          : 'AVAILABLE'}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="move-controls" aria-label="Legal pieces">
        {moves
          .filter(
            (m, i) => moves.findIndex((x) => x.pieceId === m.pieceId) === i,
          )
          .map((m) => {
            const p = auth.pieces.find((p) => p.id === m.pieceId)!;
            return (
              <button
                key={p.id}
                className={linkedId === p.id ? 'linked-piece' : ''}
                onPointerEnter={() => auth.revenge && linkPiece(p.id)}
                onPointerLeave={() => auth.revenge && linkPiece(null)}
                onFocus={() => auth.revenge && linkPiece(p.id)}
                onBlur={() => auth.revenge && linkPiece(null)}
                onClick={() => move(p.id)}
                style={{ '--player': COLORS[p.seat] } as CSSProperties}
                aria-label={
                  m.action === 'activate'
                    ? `Select Halki piece ${p.number + 1}`
                    : `Move piece ${p.number + 1}`
                }
                aria-pressed={
                  m.action === 'activate' ? selected === p.id : undefined
                }
              >
                <span>{MARKS[p.seat]}</span>Piece {p.number + 1}
                <small>
                  {m.action === 'activate'
                    ? 'HALKI'
                    : p.position.kind.startsWith('HALKI_')
                      ? 'REVERSE'
                      : p.position.kind === 'BASE'
                        ? 'OPEN'
                        : m.stopsAtGate
                          ? 'HOME GATE'
                          : `MOVE ${auth.revenge ? chosenDie?.value : auth.dice}`}
                </small>
              </button>
            );
          })}
      </div>
      {!!activations.length && (
        <div
          className="halki-choices"
          aria-label={
            auth.revenge?.halkiChoice?.required
              ? 'Required Halki targets'
              : 'Optional Halki targets'
          }
        >
          <strong>
            HALKI{' '}
            {auth.revenge?.halkiChoice?.required ? 'REQUIRED' : 'AVAILABLE'} · 6
            + {auth.revenge!.activationValue}
          </strong>
          <span>Choose a finished piece above, then its Home target.</span>
          <p>
            {auth.revenge?.halkiChoice?.required
              ? 'Only one unfinished piece remains. Choose your Home attack.'
              : 'Use Halki, or keep both values for ordinary moves.'}
          </p>
          <div>
            {activations
              .filter((m) => m.pieceId === selected)
              .map((m) => {
                const target = auth.players.find((p) => p.id === m.targetId)!;
                const at = m.path.at(-1)!;
                return (
                  <button
                    key={m.targetId}
                    className="quiet-button"
                    style={{ '--player': COLORS[target.seat] } as CSSProperties}
                    onClick={() =>
                      void onAction({
                        type: 'move',
                        pieceId: m.pieceId,
                        targetId: m.targetId,
                        dieId: m.dieId,
                      })
                    }
                  >
                    Invade {target.name} · HOME{' '}
                    {'index' in at ? at.index + 1 : ''}
                  </button>
                );
              })}
          </div>
          {!auth.revenge?.halkiChoice?.required && (
            <button
              className="quiet-button decline-halki"
              onClick={() => void onAction({ type: 'declineHalki' })}
            >
              Play dice normally
            </button>
          )}
        </div>
      )}
      {auth.revenge?.rulePending && (
        <p role="alert" className="rule-pending">
          {auth.revenge.rulePending} This action is paused.
        </p>
      )}
      {inspection && (
        <button className="gate-inspection" onClick={() => setInspection('')}>
          {inspection} <X size={14} />
        </button>
      )}
      <output className="event-notice" aria-live="polite" aria-atomic="true">
        {game.notice ||
          (auth.revenge ? 'Winning isn’t safe.' : 'No knock. No home.')}
      </output>
      {game.prefs.hints &&
        canPlay &&
        auth.dice !== null &&
        !activations.length && (
          <p className="context-hint">
            {(auth.revenge ? chosenDie?.value : auth.dice) === 6
              ? 'A six: open a piece or move another by six.'
              : 'Tap a highlighted piece, or use its button below the board.'}
          </p>
        )}
      {auth.revenge && (
        <Chat
          model={game.snapshot!}
          onAction={game.act}
          pending={game.pending}
        />
      )}
      {game.snapshot!.pause && (
        <ConnectionPause
          model={game.snapshot!}
          now={time ? time + game.clockOffset : model.serverNow}
          pending={game.pending}
          onAction={onAction}
          onLeave={onLeave}
        />
      )}
    </section>
  );
}
export function Results({
  model,
  onAction,
  onLeave,
  pending,
}: {
  model: Snapshot;
  onAction: (i: Omit<Intent, 'v' | 'requestId'>) => Promise<unknown>;
  onLeave: () => void;
  pending: boolean;
}) {
  const match = model.match!,
    winner = match.players.find((p) => p.id === match.winner),
    host = model.hostId === model.selfId;
  return (
    <section className="results">
      <div className="winner-confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i
            key={i}
            style={
              {
                '--x': `${8 + ((i * 31) % 84)}%`,
                '--delay': `${(i % 6) * 0.1}s`,
                '--color':
                  COLORS[
                    match.players.filter((p) =>
                      match.winnerTeam
                        ? p.team === match.winnerTeam
                        : p.id === match.winner,
                    )[i % (match.winnerTeam ? 2 : 1)]?.seat ?? 0
                  ],
              } as CSSProperties
            }
          />
        ))}
      </div>
      <div className="winner-mark" style={{ color: COLORS[winner?.seat ?? 0] }}>
        <Trophy size={44} />
      </div>
      <span className="eyebrow">THE TABLE HAS SPOKEN</span>
      <h1>
        {match.winnerTeam
          ? `Team ${match.winnerTeam}`
          : (winner?.name ?? 'The table')}{' '}
        wins.
      </h1>
      <p>
        {match.winReason === 'FORFEIT'
          ? match.winnerTeam
            ? 'The opposing team forfeited.'
            : 'Last player at the table.'
          : match.winnerTeam
            ? 'Eight home. A shared victory.'
            : 'Four home. Bragging rights secured.'}
      </p>
      <div className="winner-players" aria-label="Winning players">
        {match.players
          .filter((p) =>
            match.winnerTeam
              ? p.team === match.winnerTeam
              : p.id === match.winner,
          )
          .map((p) => {
            const look = publicCosmetics(
              model.members.find((m) => m.id === p.id)?.cosmetics,
            );
            return (
              <div
                className={`winner-person banner-${look.banner}`}
                key={p.id}
                style={{ '--player': COLORS[p.seat] } as CSSProperties}
              >
                <Avatar id={look.avatar} />
                <div>
                  <small>
                    {p.team ? `TEAM ${p.team} · ` : ''}
                    {MARKS[p.seat]} WINNER
                  </small>
                  <strong>{p.name}</strong>
                </div>
              </div>
            );
          })}
      </div>
      <div className="victory-ribbon">
        <span>
          <strong>{match.turnNumber}</strong> turns
        </span>
        <span>
          <strong>{match.players.reduce((n, p) => n + p.knocked, 0)}</strong>{' '}
          knocks
        </span>
        <span>
          <strong>{match.players.reduce((n, p) => n + p.sixes, 0)}</strong>{' '}
          sixes rolled
        </span>
      </div>
      <div className="results-board">
        <Board
          revenge={match.revenge}
          label={`MOVO ${modeName(match.mode)} result board`}
          pieces={match.pieces.filter(
            (p) => !match.players.find((o) => o.id === p.ownerId)!.forfeited,
          )}
          unlocked={match.players
            .filter((p) => p.homeUnlocked)
            .map((p) => p.seat)}
        />
      </div>
      <div className="results-stats">
        <table>
          <caption>Match statistics</caption>
          <thead>
            <tr>
              <th>Player</th>
              <th>Home</th>
              <th>Knocks</th>
              <th>Sixes</th>
              <th>Distance</th>
            </tr>
          </thead>
          <tbody>
            {[...match.players]
              .sort(
                (a, b) =>
                  Number(b.id === winner?.id) - Number(a.id === winner?.id),
              )
              .map((p) => (
                <tr key={p.id}>
                  <th>
                    <span style={{ color: COLORS[p.seat] }}>
                      {MARKS[p.seat]}
                    </span>{' '}
                    {p.name}
                    {p.team ? ` · TEAM ${p.team}` : ''}
                    {p.forfeited ? ' · LEFT' : ''}
                  </th>
                  <td>
                    {
                      match.pieces.filter(
                        (x) => x.ownerId === p.id && x.position.kind === 'HOME',
                      ).length
                    }
                    /4
                  </td>
                  <td>{p.knocked}</td>
                  <td>{p.sixes}</td>
                  <td>{p.distance}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="results-actions">
        {host ? (
          <button
            className="primary-button"
            disabled={pending}
            onClick={() => onAction({ type: 'rematch' })}
          >
            Rematch <ArrowRight size={18} />
          </button>
        ) : (
          <span>Waiting for the host to call a rematch.</span>
        )}
        {host && (
          <button
            className="quiet-button"
            disabled={pending}
            onClick={() => onAction({ type: 'rematch' })}
          >
            Return to lobby
          </button>
        )}
        <button className="quiet-button" onClick={onLeave}>
          Leave table
        </button>
      </div>
      {host && (
        <p className="rematch-note">
          Same table. Same rivals. Ready up in the lobby for the next game.
        </p>
      )}
    </section>
  );
}

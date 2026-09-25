'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { Snapshot, Intent, Reply, Welcome } from '../shared/protocol';
import { isRevenge } from '../shared/modes';
import { DICE_ROLL_MS, DICE_REDUCED_MS } from '../shared/dice-presentation';
import type { GameEvent } from '../shared/game';
import type { Position } from '../shared/topology';
import { hopDuration, type PieceMotion } from '../shared/motion';
import {
  defaults,
  normalizePreferences,
  playSound,
  haptic,
  type Preferences,
} from '../lib/sound';
import { publicCosmetics } from '../shared/cosmetics';
import { capturePresentation } from '../shared/presentation-events';
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const safeRead = (store: Storage, key: string) => {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
};
function eventText(e: GameEvent, s: Snapshot) {
  const n = s.match?.players.find((p) => p.id === e.playerId)?.name ?? 'Player';
  switch (e.type) {
    case 'DICE_ROLLED':
      return `${n} rolled ${e.value}.`;
    case 'NO_MOVES':
      return 'No legal moves. Next player.';
    case 'SIX_BURNED':
      return s.match && isRevenge(s.match.mode)
        ? `${e.value} sixes burned. The non-six remains usable.`
        : 'Three sixes. This roll is forfeited.';
    case 'HOME_UNLOCKED':
      return e.pieceId
        ? `${n}'s piece ${Number(e.pieceId.split(':').at(-1)) + 1} can enter Home.`
        : `${n} · Home unlocked!`;
    case 'HOME_LOCKED':
      return 'HOME LOCKED · GET 1 KNOCK. The gate is not safe.';
    case 'STALEMATE_ESCAPED':
      return 'SOLO STALEMATE ESCAPE · Trapped pieces can enter Home. Exact dice still apply.';
    case 'MISSED_CAPTURE':
      return `${n}'s piece ${Number(e.pieceId?.split(':').at(-1)) + 1} missed a legal capture and returns to Base.`;
    case 'PIECE_KNOCKED':
      return `${n} knocked ${s.match?.players.find((p) => p.id === e.targetId)?.name ?? 'a rival'}!`;
    case 'HOME_ENTERED':
      return `${n} entered the home lane.`;
    case 'PIECE_SECURED':
      return `${n} brought a piece home.`;
    case 'PLAYER_WON':
      return `${n} wins!`;
    case 'TEAM_WON':
      return `Team ${s.match?.winnerTeam} wins!`;
    case 'TURN_TIMEOUT':
      return `${n} ran out of time.`;
    case 'PLAYER_FORFEITED':
      return `${n} left the match.`;
    case 'MATCH_STARTED':
      return `Game on. ${n} goes first.`;
    case 'HALKI_ACTIVATED':
      return `${n} · HALKI. A finished piece invades enemy Home.`;
    case 'HALKI_DIED':
      return `${n}'s Halki is a normal Base piece again.`;
    case 'SHIELD_CREATED':
      return 'TEAM SHIELD · Both teammate colors are represented.';
    case 'CONTEST_CREATED':
      return 'CONTESTED · Both sides remain on the square.';
    case 'SHIELD_BROKEN':
      return 'SHIELD BROKEN · The waiting rival attacks.';
    case 'REINFORCED':
      return 'REINFORCEMENT · The waiting rival is knocked.';
    case 'SUPPORT_WAIT':
      return `${n} · 4/4 secured. Support in four complete rotations.`;
    case 'SUPPORT_READY':
      return `${n} · SUPPORT READY.`;
    case 'RULE_PENDING':
      return (
        s.match?.revenge?.rulePending ?? 'This collision needs a rule decision.'
      );
    default:
      return `${n} moved a piece.`;
  }
}
export function useGame() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [display, setDisplay] = useState<Snapshot | null>(null),
    [clockOffset, setClockOffset] = useState(0),
    [status, setStatus] = useState('Connecting'),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [effect, setEffect] = useState(''),
    [effectSeat, setEffectSeat] = useState<number | undefined>(),
    [motion, setMotion] = useState<PieceMotion | null>(null),
    [captureMotions, setCaptureMotions] = useState<PieceMotion[]>([]),
    [impact, setImpact] = useState<{
      key: number;
      at: Position;
      seat: number;
      halki: boolean;
      count: number;
    } | null>(null),
    [die, setDie] = useState<number | null>(null),
    [positions, setPositions] = useState<Record<string, Position>>({}),
    [prefs, setPrefs] = useState<Preferences>(defaults),
    [guestName, setGuestName] = useState('');
  const socketRef = useRef<Socket | null>(null),
    latest = useRef<Snapshot | null>(null),
    preferences = useRef(prefs),
    first = useRef(true),
    requestLock = useRef(false),
    preferencesLoaded = useRef(false);
  useEffect(() => {
    preferences.current = prefs;
    document.documentElement.dataset.movoMotion = prefs.reduced
      ? 'reduced'
      : 'full';
    if (!preferencesLoaded.current) return;
    try {
      localStorage.setItem('movo.preferences', JSON.stringify(prefs));
    } catch {
      /* Device storage can be unavailable. */
    }
  }, [prefs]);
  useEffect(() => {
    const epoch = { current: 0 },
      queue = { current: [] as Snapshot[] },
      running = { current: false };
    let motionKey = 0;
    queueMicrotask(() => {
      try {
        const p = JSON.parse(
          safeRead(localStorage, 'movo.preferences') ?? 'null',
        ) as Partial<Preferences> | null;
        setPrefs(
          normalizePreferences(
            p ?? {},
            matchMedia('(prefers-reduced-motion: reduce)').matches,
          ),
        );
        setGuestName(safeRead(localStorage, 'movo.name') ?? '');
      } catch {
        /* Keep defaults. */
      }
      preferencesLoaded.current = true;
    });
    const socket = io({
      auth: {
        v: 1,
        token: safeRead(sessionStorage, 'movo.token') ?? undefined,
      },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 700,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;
    const reset = (s: Snapshot | null) => {
      epoch.current++;
      queue.current = [];
      running.current = false;
      setBusy(false);
      setEffect('');
      setMotion(null);
      setCaptureMotions([]);
      setImpact(null);
      setEffectSeat(undefined);
      setPositions({});
      setDisplay(s);
      setDie(s?.match?.lastRoll ?? null);
    };
    async function drain() {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      const generation = epoch.current;
      while (queue.current.length && generation === epoch.current) {
        const s = queue.current.shift()!;
        const reduced = preferences.current.reduced;
        const capture = capturePresentation(s.events);
        let capturesShown = false;
        for (const e of s.events) {
          if (generation !== epoch.current) return;
          setNotice(eventText(e, s));
          setEffectSeat(
            s.match?.players.find((p) => p.id === e.playerId)?.seat,
          );
          if (
            [
              'HALKI_ACTIVATED',
              'SHIELD_CREATED',
              'CONTEST_CREATED',
              'SHIELD_BROKEN',
              'REINFORCED',
              'SUPPORT_READY',
              'HALKI_DIED',
            ].includes(e.type)
          ) {
            setEffect(
              e.type === 'HALKI_ACTIVATED'
                ? 'halki-activation'
                : e.type.toLowerCase().replaceAll('_', '-'),
            );
            playSound(
              e.type === 'HALKI_ACTIVATED'
                ? 'halkiActivation'
                : e.type === 'SUPPORT_READY'
                  ? 'supportReady'
                  : e.type === 'REINFORCED'
                    ? 'reinforcement'
                    : e.type === 'SHIELD_BROKEN'
                      ? 'shieldBreak'
                      : e.type === 'HALKI_DIED'
                        ? 'halkiDeath'
                        : 'teamShield',
              preferences.current,
            );
            if (e.type === 'SHIELD_BROKEN')
              setDisplay((prev) =>
                prev?.match?.revenge
                  ? {
                      ...prev,
                      match: {
                        ...prev.match,
                        revenge: {
                          ...prev.match.revenge,
                          shields: s.match!.revenge!.shields,
                          contests: s.match!.revenge!.contests,
                        },
                      },
                    }
                  : prev,
              );
            if (!reduced) await sleep(e.type === 'HALKI_ACTIVATED' ? 450 : 280);
          } else if (e.type === 'DICE_ROLLED') {
            setDie(e.value!);
            setEffect('dice-rolling');
            playSound('dice', preferences.current);
            await sleep(reduced ? DICE_REDUCED_MS : DICE_ROLL_MS);
            if (generation !== epoch.current) return;
            setDie(e.value!);
            playSound('diceLand', preferences.current);
            setEffect('');
            haptic(preferences.current);
          } else if (e.type === 'PIECE_MOVED' && e.pieceId && e.path) {
            setEffect('piece-moving');
            let from = e.from!;
            for (const [i, p] of e.path.entries()) {
              if (generation !== epoch.current) return;
              const duration = reduced ? 45 : hopDuration(i, e.path.length);
              setMotion({
                key: ++motionKey,
                pieceId: e.pieceId,
                from,
                duration,
                kind: 'hop',
                final: i === e.path.length - 1,
                reduced,
              });
              setPositions((prev) => ({ ...prev, [e.pieceId!]: p }));
              if (i === 0) playSound('pieceLift', preferences.current);
              await sleep(duration);
              if (generation !== epoch.current) return;
              playSound(
                i === e.path.length - 1
                  ? 'pieceLand'
                  : p.kind.startsWith('HALKI_')
                    ? 'halkiHop'
                    : 'pieceHop',
                preferences.current,
              );
              from = p;
            }
            setMotion(null);
          } else if (e.type === 'PIECE_KNOCKED' && e.pieceId) {
            if (capturesShown) continue;
            capturesShown = true;
            setEffect('knock-impact');
            playSound(
              capture.halki
                ? 'halkiKill'
                : capture.victims.length > 1
                  ? 'multiCapture'
                  : 'knockImpact',
              preferences.current,
            );
            setImpact({
              key: ++motionKey,
              at:
                e.from!.kind === 'HOME_LANE'
                  ? {
                      kind: 'HALKI_HOME_INVASION',
                      homeSeat: s.match!.pieces.find((p) => p.id === e.pieceId)!
                        .seat,
                      index: e.from!.index,
                    }
                  : e.from!,
              seat:
                s.match?.players.find((p) => p.id === e.playerId)?.seat ?? 0,
              halki: capture.halki,
              count: capture.victims.length,
            });
            haptic(preferences.current);
            if (!reduced) await sleep(90);
            if (generation !== epoch.current) return;
            const duration = reduced ? 45 : capture.duration;
            setMotion(null);
            setCaptureMotions(
              capture.victims.map((v, i) => ({
                key: ++motionKey,
                pieceId: v.pieceId!,
                from: v.from!,
                duration: duration - (reduced ? 0 : Math.min(i, 3) * 25),
                delay: reduced ? 0 : Math.min(i, 3) * 25,
                kind: 'return',
                final: true,
                reduced,
              })),
            );
            playSound('knockReturn', preferences.current);
            setPositions((prev) => ({
              ...prev,
              ...Object.fromEntries(
                capture.victims.map((v) => [v.pieceId!, { kind: 'BASE' }]),
              ),
            }));
            await sleep(duration);
            if (generation !== epoch.current) return;
            setDisplay((prev) =>
              prev?.match
                ? {
                    ...prev,
                    match: {
                      ...prev.match,
                      players: prev.match.players.map((p) =>
                        p.id === e.playerId
                          ? {
                              ...p,
                              knocked: s.match!.players.find(
                                (x) => x.id === p.id,
                              )!.knocked,
                            }
                          : p,
                      ),
                    },
                  }
                : prev,
            );
            setCaptureMotions([]);
            setImpact(null);
          } else if (e.type === 'MISSED_CAPTURE' && e.pieceId) {
            const duration = reduced ? 45 : 420;
            setMotion({
              key: ++motionKey,
              pieceId: e.pieceId,
              from: e.from!,
              duration,
              kind: 'return',
              final: true,
              reduced,
            });
            setPositions((prev) => ({
              ...prev,
              [e.pieceId!]: { kind: 'BASE' },
            }));
            await sleep(duration);
            if (generation !== epoch.current) return;
            setMotion(null);
          } else if (e.type === 'HOME_LOCKED') {
            setEffect('home-gate-lock');
            playSound('homeGateLock', preferences.current);
            if (!reduced) await sleep(380);
          } else if (
            ['HOME_UNLOCKED', 'HOME_ENTERED', 'PIECE_SECURED'].includes(e.type)
          ) {
            if (e.type === 'HOME_UNLOCKED')
              setDisplay((prev) =>
                prev?.match
                  ? {
                      ...prev,
                      match: {
                        ...prev.match,
                        players: prev.match.players.map((p) =>
                          p.id === e.playerId
                            ? { ...p, homeUnlocked: true }
                            : p,
                        ),
                        pieces: prev.match.pieces.map((p) =>
                          p.ownerId === e.playerId &&
                          (!e.pieceId || p.id === e.pieceId) &&
                          p.position.kind === 'HOME_GATE_LOCKED'
                            ? {
                                ...p,
                                position: { ...p.position, kind: 'TRACK' },
                              }
                            : p,
                        ),
                      },
                    }
                  : prev,
              );
            setEffect(
              e.type === 'HOME_UNLOCKED' ? 'home-unlock' : 'home-secured',
            );
            if (e.type === 'HOME_UNLOCKED') {
              setPositions((prev) =>
                Object.fromEntries(
                  Object.entries(prev).map(([id, p]) => [
                    id,
                    s.match?.pieces.find((x) => x.id === id)?.ownerId ===
                      e.playerId && p.kind === 'HOME_GATE_LOCKED'
                      ? { ...p, kind: 'TRACK' }
                      : p,
                  ]),
                ),
              );
            }
            playSound(
              e.type === 'HOME_UNLOCKED'
                ? 'homeUnlock'
                : e.type === 'HOME_ENTERED'
                  ? 'homeEntry'
                  : 'pieceSecured',
              preferences.current,
            );
            haptic(preferences.current);
            if (!reduced) await sleep(400);
          } else if (e.type === 'PLAYER_WON' || e.type === 'TEAM_WON') {
            setEffect('victory-settle');
            playSound('win', preferences.current);
            if (!reduced) await sleep(850);
          }
        }
        if (generation !== epoch.current) return;
        setDisplay(s);
        setPositions({});
        setMotion(null);
        setCaptureMotions([]);
        setEffect('');
      }
      if (generation === epoch.current) {
        running.current = false;
        setBusy(false);
      }
    }
    function receive(s: Snapshot | null) {
      if (
        s &&
        latest.current?.code === s.code &&
        s.version <= latest.current.version
      )
        return;
      const previous = latest.current;
      const initial =
        first.current ||
        !s ||
        s.code !== latest.current?.code ||
        s.match?.id !== latest.current?.match?.id;
      latest.current = s;
      if (
        (!initial ||
          (!first.current &&
            s?.events.some((event) => event.type === 'MATCH_STARTED'))) &&
        s?.match?.phase === 'PLAYING' &&
        s.match.currentPlayerId === s.selfId &&
        s.match.turnNumber !== previous?.match?.turnNumber
      )
        playSound('turnStart', preferences.current);
      if (!initial && s) {
        const reaction = s.reactions?.at(-1),
          chat = s.chat?.at(-1);
        if (reaction && reaction.id !== previous?.reactions?.at(-1)?.id)
          playSound('reaction', preferences.current);
        if (
          chat &&
          chat.id !== previous?.chat?.at(-1)?.id &&
          chat.playerId !== s.selfId
        )
          playSound('chat', preferences.current);
      }
      if (s) setClockOffset(s.serverNow - Date.now());
      setSnapshot(s);
      if (initial || s?.pause) {
        first.current = false;
        reset(s);
        if (s?.events.length) setNotice(eventText(s.events.at(-1)!, s));
      } else {
        queue.current.push(s!);
        void drain();
      }
    }
    socket.on('snapshot', receive);
    socket.on('welcome', (w: Welcome) => {
      if (w.token) {
        try {
          sessionStorage.setItem('movo.token', w.token);
        } catch {
          setError(
            'Storage is unavailable. Keep this tab open to keep your seat.',
          );
        }
        socket.auth = { v: 1, token: w.token };
      }
      first.current = false;
      latest.current = w.snapshot;
      if (w.snapshot) setClockOffset(w.snapshot.serverNow - Date.now());
      setSnapshot(w.snapshot);
      reset(w.snapshot);
      setStatus('Connected');
      setError('');
    });
    socket.on('disconnect', () => {
      first.current = true;
      reset(latest.current);
      setStatus('Reconnecting');
    });
    socket.on('connect_error', (e: Error) => {
      setStatus('Offline');
      setError(
        /expired|version|connections/.test(e.message)
          ? e.message
          : 'The table is offline. Reconnecting…',
      );
    });
    return () => {
      epoch.current++;
      queue.current = [];
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, []);
  const act = useCallback(
    async (input: Omit<Intent, 'v' | 'requestId'>): Promise<Reply> => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setError('Reconnect before making a move.');
        return { ok: false };
      }
      if (requestLock.current) return { ok: false };
      requestLock.current = true;
      setPending(true);
      setError('');
      if (input.name) {
        setGuestName(input.name);
        try {
          localStorage.setItem('movo.name', input.name);
        } catch {
          /* Nonessential preference. */
        }
      }
      const id =
        typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
              x.toString(16).padStart(2, '0'),
            ).join('');
      const payload: Intent = {
        ...input,
        ...(['create', 'join', 'quick'].includes(input.type)
          ? { cosmetics: publicCosmetics(preferences.current) }
          : {}),
        v: 1,
        requestId: id,
        revision: latest.current?.match?.revision,
        matchId: latest.current?.match?.id,
      };
      const result = await new Promise<Reply>((resolve) =>
        socket
          .timeout(7000)
          .emit('intent', payload, (err: Error | null, r: Reply) => {
            if (err) {
              socket
                .timeout(7000)
                .emit(
                  'intent',
                  payload,
                  (retryError: Error | null, retry: Reply) =>
                    resolve(
                      retryError
                        ? {
                            ok: false,
                            error:
                              'Connection is slow. Your board will refresh when it returns.',
                          }
                        : retry,
                    ),
                );
            } else resolve(r);
          }),
      );
      requestLock.current = false;
      setPending(false);
      if (!result.ok) setError(result.error ?? 'Please try again.');
      return result;
    },
    [],
  );
  const retry = () => {
    if (error.includes('expired')) {
      try {
        sessionStorage.removeItem('movo.token');
      } catch {
        /* Fresh session fallback. */
      }
      socketRef.current!.auth = { v: 1 };
    }
    socketRef.current?.connect();
  };
  return {
    snapshot,
    display,
    clockOffset,
    status,
    error,
    setError,
    pending,
    busy,
    notice,
    effect,
    effectSeat,
    motion,
    captureMotions,
    impact,
    die,
    positions,
    prefs,
    setPrefs,
    guestName,
    setGuestName,
    act,
    retry,
  };
}

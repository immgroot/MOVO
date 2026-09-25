import {
  STARTS,
  SAFE_SPACES,
  nextPosition,
  isOuter,
  type Seat,
  type Position,
} from './topology';
import { revengeRules } from './revenge';
import type { RevengeState } from './revenge-types';
import { RuleError } from './errors';
import { isRevenge, isTeamMode, type Mode } from './modes';
export type { Mode } from './modes';
export { RuleError } from './errors';
export const PROTOCOL_VERSION = 1;
export type Team = 'A' | 'B';
export const teamForSeat = (seat: Seat): Team => (seat % 2 === 0 ? 'A' : 'B');
export interface Player {
  id: string;
  name: string;
  seat: Seat;
  knocked: number;
  homeUnlocked: boolean;
  sixes: number;
  team: Team | null;
  distance: number;
  forfeited: boolean;
}
export interface Piece {
  id: string;
  ownerId: string;
  seat: Seat;
  number: number;
  position: Position;
  /** Revenge lifetime state; absent in KNOCKOUT. */
  hasUsedHalki?: boolean;
  halkiInvadedHomeOwnerId?: string | null;
  /** Revenge capture credit belongs to the physical piece. */
  hasCaptured?: boolean;
  /** Solo global-stalemate escape; never counts as a capture. */
  homeEntryWaived?: boolean;
}
export interface Match {
  revenge?: RevengeState;
  id: string;
  mode: Mode;
  rulesVersion: 2;
  phase: 'PLAYING' | 'FINISHED';
  players: Player[];
  pieces: Piece[];
  currentPlayerId: string;
  turnNumber: number;
  dice: number | null;
  lastRoll: number | null;
  consecutiveSixes: number;
  revision: number;
  winner: string | null;
  winnerTeam: Team | null;
  winReason: 'HOME' | 'FORFEIT' | null;
  timerSeconds: number;
  deadline: number | null;
}
export interface Move {
  dieId?: string;
  diceIds?: [string, string];
  action?: 'activate';
  targetId?: string;
  pieceId: string;
  path: Position[];
  knockIds: string[];
  stopsAtGate: boolean;
}
export type EventType =
  | 'MATCH_STARTED'
  | 'DICE_ROLLED'
  | 'SIX_BURNED'
  | 'NO_MOVES'
  | 'PIECE_MOVED'
  | 'PIECE_KNOCKED'
  | 'MISSED_CAPTURE'
  | 'STALEMATE_ESCAPED'
  | 'HOME_UNLOCKED'
  | 'HOME_ENTERED'
  | 'PIECE_SECURED'
  | 'PLAYER_WON'
  | 'TEAM_WON'
  | 'TURN_TIMEOUT'
  | 'PLAYER_FORFEITED'
  | 'HOME_LOCKED'
  | 'HALKI_ACTIVATED'
  | 'HALKI_DIED'
  | 'SHIELD_CREATED'
  | 'SHIELD_BROKEN'
  | 'CONTEST_CREATED'
  | 'REINFORCED'
  | 'SUPPORT_WAIT'
  | 'SUPPORT_READY'
  | 'RULE_PENDING';
export interface GameEvent {
  type: EventType;
  playerId: string;
  pieceId?: string;
  value?: number;
  path?: Position[];
  from?: Position;
  targetId?: string;
}
export interface Resolution {
  state: Match;
  events: GameEvent[];
}
export function createMatch(
  id: string,
  members: { id: string; name: string; seat: Seat }[],
  timerSeconds = 30,
  now = Date.now(),
  mode: Mode = 'KNOCKOUT',
): Match {
  if (isRevenge(mode))
    return revengeRules.createMatch(id, members, timerSeconds, now, mode);
  if (
    members.length < 2 ||
    members.length > 4 ||
    new Set(members.map((p) => p.id)).size !== members.length ||
    new Set(members.map((p) => p.seat)).size !== members.length
  )
    throw new RuleError('A match needs two to four different seats.');
  if (!['KNOCKOUT', 'KNOCKOUT_2V2'].includes(mode))
    throw new RuleError('Choose an available mode.');
  if (mode === 'KNOCKOUT_2V2' && members.length !== 4)
    throw new RuleError('KNOCKOUT 2v2 needs exactly four players.');
  members = [...members].sort((a, b) => a.seat - b.seat);
  return {
    id,
    mode,
    rulesVersion: 2,
    phase: 'PLAYING',
    players: members.map((p) => ({
      ...p,
      knocked: 0,
      homeUnlocked: false,
      sixes: 0,
      team: mode === 'KNOCKOUT_2V2' ? teamForSeat(p.seat) : null,
      distance: 0,
      forfeited: false,
    })),
    pieces: members.flatMap((p) =>
      Array.from({ length: 4 }, (_, n) => ({
        id: `${p.id}:${n}`,
        ownerId: p.id,
        seat: p.seat,
        number: n,
        position: { kind: 'BASE' as const },
      })),
    ),
    currentPlayerId: members[0].id,
    turnNumber: 1,
    dice: null,
    lastRoll: null,
    consecutiveSixes: 0,
    revision: 0,
    winner: null,
    winnerTeam: null,
    winReason: null,
    timerSeconds,
    deadline: timerSeconds ? now + timerSeconds * 1000 : null,
  };
}
function occupants(state: Match, index: number, exclude: string) {
  return state.pieces.filter(
    (p) =>
      p.id !== exclude &&
      isOuter(p.position) &&
      p.position.index === index &&
      !state.players.find((o) => o.id === p.ownerId)!.forfeited,
  );
}
export function teammates(state: Match, a: string, b: string) {
  const first = state.players.find((p) => p.id === a),
    second = state.players.find((p) => p.id === b);
  return (
    a === b ||
    (isTeamMode(state.mode) && !!first?.team && first.team === second?.team)
  );
}
export function homeCount(state: Match, playerId: string) {
  return state.pieces.filter(
    (p) => p.ownerId === playerId && p.position.kind === 'HOME',
  ).length;
}
export function teamProgress(state: Match, team: Team) {
  return state.players
    .filter((p) => p.team === team)
    .reduce((n, p) => n + homeCount(state, p.id), 0);
}
export function legalMoves(
  state: Match,
  playerId: string,
  roll?: number | null,
): Move[] {
  if (isRevenge(state.mode))
    return revengeRules.legalMoves(state, playerId, roll);
  return normalMoves(state, playerId, roll);
}
/** Shared forward route. Revenge requires personal capture credit and exact dice. */
export function normalMoves(
  state: Match,
  playerId: string,
  roll?: number | null,
  pieceHomeAccess = false,
): Move[] {
  if (roll === undefined) roll = state.dice;
  const player = state.players.find((p) => p.id === playerId);
  if (
    state.phase !== 'PLAYING' ||
    state.currentPlayerId !== playerId ||
    !player ||
    player.forfeited ||
    roll === null ||
    !Number.isInteger(roll) ||
    roll < 1 ||
    roll > 6
  )
    return [];
  const moves: Move[] = [];
  for (const piece of state.pieces.filter((p) => p.ownerId === playerId)) {
    const unlocked = pieceHomeAccess
      ? piece.hasCaptured === true || piece.homeEntryWaived === true
      : player.homeUnlocked;
    if (
      piece.position.kind === 'HOME' ||
      (piece.position.kind === 'HOME_GATE_LOCKED' && !unlocked) ||
      (piece.position.kind === 'BASE' && roll !== 6)
    )
      continue;
    const path: Position[] = [];
    let cursor: Position | null = piece.position;
    if (cursor.kind === 'BASE')
      path.push({ kind: 'TRACK', index: STARTS[player.seat], travelled: 0 });
    else
      for (let i = 0; i < roll; i++) {
        cursor = nextPosition(cursor, player.seat, unlocked);
        if (!cursor) break;
        path.push(cursor);
        // Arrival at a locked gate consumes this move; unused pips are lost.
        if (cursor.kind === 'HOME_GATE_LOCKED') break;
      }
    if (!path.length) continue;
    const destination = path[path.length - 1];
    if (
      (pieceHomeAccess || destination.kind !== 'HOME_GATE_LOCKED') &&
      path.length !== (piece.position.kind === 'BASE' ? 1 : roll)
    )
      continue;
    const targets = isOuter(destination)
      ? occupants(state, destination.index, piece.id)
      : [];
    const unsafe = isOuter(destination) && !SAFE_SPACES.has(destination.index);
    const enemies = targets.filter(
      (p) => !teammates(state, p.ownerId, playerId),
    );
    const shielded = enemies.some((a) =>
      enemies.some(
        (b) =>
          a.ownerId !== b.ownerId && teammates(state, a.ownerId, b.ownerId),
      ),
    );
    moves.push({
      pieceId: piece.id,
      path,
      knockIds: unsafe && !shielded ? enemies.map((p) => p.id) : [],
      stopsAtGate: destination.kind === 'HOME_GATE_LOCKED',
    });
  }
  return moves;
}
function checkTurn(state: Match, playerId: string) {
  if (state.phase !== 'PLAYING')
    throw new RuleError('This match has finished.');
  if (state.currentPlayerId !== playerId)
    throw new RuleError('Wait for your turn.');
}
function resetDeadline(state: Match, now: number) {
  state.deadline = state.timerSeconds ? now + state.timerSeconds * 1000 : null;
}
function advance(state: Match, now: number) {
  const index = state.players.findIndex((p) => p.id === state.currentPlayerId);
  for (let step = 1; step <= state.players.length; step++) {
    const p = state.players[(index + step) % state.players.length];
    if (!p.forfeited && homeCount(state, p.id) < 4) {
      state.currentPlayerId = p.id;
      break;
    }
  }
  state.turnNumber++;
  state.dice = null;
  state.consecutiveSixes = 0;
  resetDeadline(state, now);
}
export function resolveRoll(
  original: Match,
  playerId: string,
  roll: number,
  now = Date.now(),
): Resolution {
  if (isRevenge(original.mode))
    return revengeRules.roll(original, playerId, roll, now);
  checkTurn(original, playerId);
  if (original.dice !== null)
    throw new RuleError('Move a piece before rolling again.');
  if (!Number.isInteger(roll) || roll < 1 || roll > 6)
    throw new RuleError('Invalid die result.');
  const state = structuredClone(original),
    events: GameEvent[] = [{ type: 'DICE_ROLLED', playerId, value: roll }];
  state.revision++;
  state.dice = roll;
  state.lastRoll = roll;
  state.consecutiveSixes = roll === 6 ? state.consecutiveSixes + 1 : 0;
  if (roll === 6) state.players.find((p) => p.id === playerId)!.sixes++;
  if (state.consecutiveSixes === 3) {
    events.push({ type: 'SIX_BURNED', playerId });
    advance(state, now);
  } else if (!legalMoves(state, playerId).length) {
    events.push({ type: 'NO_MOVES', playerId });
    advance(state, now);
  }
  return { state, events };
}
export function resolveMove(
  original: Match,
  playerId: string,
  pieceId: string,
  now = Date.now(),
  targetId?: string,
  dieId?: string,
): Resolution {
  if (isRevenge(original.mode))
    return revengeRules.move(original, playerId, pieceId, now, targetId, dieId);
  checkTurn(original, playerId);
  const options = legalMoves(original, playerId);
  const missed = options.filter(
    (m) => m.knockIds.length && m.pieceId !== pieceId,
  );
  const move = options.find((m) => m.pieceId === pieceId);
  if (!move) throw new RuleError('That piece cannot use this roll.');
  const state = structuredClone(original),
    events: GameEvent[] = [];
  const piece = state.pieces.find((p) => p.id === pieceId)!,
    player = state.players.find((p) => p.id === playerId)!;
  events.push({
    type: 'PIECE_MOVED',
    playerId,
    pieceId,
    path: move.path,
    from: piece.position,
  });
  piece.position = move.path[move.path.length - 1];
  player.distance += move.path.length;
  for (const id of move.knockIds) {
    const target = state.pieces.find((p) => p.id === id)!;
    events.push({
      type: 'PIECE_KNOCKED',
      playerId,
      pieceId: id,
      targetId: target.ownerId,
      from: target.position,
    });
    target.position = { kind: 'BASE' };
    player.knocked++;
  }
  if (move.knockIds.length && !player.homeUnlocked) {
    player.homeUnlocked = true;
    for (const waiting of state.pieces)
      if (
        waiting.ownerId === playerId &&
        waiting.position.kind === 'HOME_GATE_LOCKED'
      )
        waiting.position = { ...waiting.position, kind: 'TRACK' };
    events.push({ type: 'HOME_UNLOCKED', playerId });
  }
  if (move.stopsAtGate && !player.homeUnlocked)
    events.push({ type: 'HOME_LOCKED', playerId, pieceId });
  if (move.path.some((p) => p.kind === 'HOME_LANE' && p.index === 0))
    events.push({ type: 'HOME_ENTERED', playerId, pieceId });
  if (piece.position.kind === 'HOME')
    events.push({ type: 'PIECE_SECURED', playerId, pieceId });
  for (const ignored of missed) {
    const offender = state.pieces.find((p) => p.id === ignored.pieceId)!;
    events.push({
      type: 'MISSED_CAPTURE',
      playerId,
      pieceId: offender.id,
      from: offender.position,
    });
    offender.position = { kind: 'BASE' };
  }
  state.revision++;
  const finished = homeCount(state, playerId) === 4;
  const won =
    state.mode === 'KNOCKOUT_2V2'
      ? teamProgress(state, player.team!) === 8
      : finished;
  if (won) {
    state.phase = 'FINISHED';
    state.winner = playerId;
    state.winnerTeam = player.team;
    state.winReason = 'HOME';
    state.deadline = null;
    state.dice = null;
    state.consecutiveSixes = 0;
    events.push({
      type: state.mode === 'KNOCKOUT_2V2' ? 'TEAM_WON' : 'PLAYER_WON',
      playerId,
    });
  } else if (state.dice === 6 && !finished) {
    state.dice = null;
    resetDeadline(state, now);
  } else advance(state, now);
  return { state, events };
}
export function resolveTimeout(original: Match, now = Date.now()): Resolution {
  if (isRevenge(original.mode)) return revengeRules.timeout(original, now);
  if (
    original.phase !== 'PLAYING' ||
    original.deadline === null ||
    now < original.deadline
  )
    return { state: original, events: [] };
  const state = structuredClone(original),
    playerId = state.currentPlayerId;
  state.revision++;
  advance(state, now);
  return { state, events: [{ type: 'TURN_TIMEOUT', playerId }] };
}
export function resolveForfeit(
  original: Match,
  playerId: string,
  now = Date.now(),
): Resolution {
  if (isRevenge(original.mode))
    return revengeRules.forfeit(original, playerId, now);
  if (
    original.phase !== 'PLAYING' ||
    original.players.find((p) => p.id === playerId)?.forfeited
  )
    return { state: original, events: [] };
  const state = structuredClone(original),
    player = state.players.find((p) => p.id === playerId);
  if (!player) return { state: original, events: [] };
  player.forfeited = true;
  state.revision++;
  const remaining = state.players.filter((p) => !p.forfeited),
    events: GameEvent[] = [{ type: 'PLAYER_FORFEITED', playerId }];
  if (remaining.length <= 1 || state.mode === 'KNOCKOUT_2V2') {
    state.phase = 'FINISHED';
    state.winner =
      remaining.find(
        (p) => state.mode !== 'KNOCKOUT_2V2' || p.team !== player.team,
      )?.id ?? null;
    state.winnerTeam =
      state.mode === 'KNOCKOUT_2V2'
        ? (state.players.find((p) => p.id === state.winner)?.team ?? null)
        : null;
    state.winReason = 'FORFEIT';
    state.deadline = null;
    state.dice = null;
    if (state.winner)
      events.push({
        type: state.mode === 'KNOCKOUT_2V2' ? 'TEAM_WON' : 'PLAYER_WON',
        playerId: state.winner,
      });
  } else if (state.currentPlayerId === playerId) {
    advance(state, now);
  }
  return { state, events };
}
export const knockoutRules = {
  createMatch,
  legalMoves,
  roll: resolveRoll,
  move: resolveMove,
  timeout: resolveTimeout,
  forfeit: resolveForfeit,
};

import {
  teammates,
  type Match,
  type Piece,
  type Team,
  type GameEvent,
} from './game';
import { RuleError } from './errors';
import { SAFE_SPACES, positionKey } from './topology';

export class UndefinedRevengeRule extends RuleError {}
export const isHalki = (p: Piece) =>
  p.position.kind === 'HALKI_TRACK' ||
  p.position.kind === 'HALKI_HOME_INVASION' ||
  p.position.kind === 'HALKI_HOME_RETURN';
const team = (s: Match, p: Piece) =>
  s.players.find((x) => x.id === p.ownerId)!.team!;
const onBoard = (p: Piece) => !['BASE', 'HOME'].includes(p.position.kind);
const key = (p: Piece) => positionKey(p.position, p.seat, p.number);
export function squarePieces(s: Match, at: Piece) {
  return s.pieces.filter(
    (p) =>
      onBoard(p) &&
      key(p) === key(at) &&
      !s.players.find((x) => x.id === p.ownerId)!.forfeited,
  );
}
export function shieldTeams(s: Match, pieces: Piece[]): Team[] {
  return (['A', 'B'] as Team[]).filter(
    (t) =>
      new Set(pieces.filter((p) => team(s, p) === t).map((p) => p.ownerId))
        .size === 2,
  );
}
function safe(p: Piece) {
  return (
    (p.position.kind === 'TRACK' || p.position.kind === 'HALKI_TRACK') &&
    SAFE_SPACES.has(p.position.index)
  );
}
function kill(
  s: Match,
  attacker: Piece,
  victims: Piece[],
  events: GameEvent[],
) {
  const player = s.players.find((p) => p.id === attacker.ownerId)!;
  let captured = false;
  for (const victim of victims) {
    if (teammates(s, attacker.ownerId, victim.ownerId)) continue;
    const special = isHalki(victim);
    events.push({
      type: 'PIECE_KNOCKED',
      playerId: attacker.ownerId,
      pieceId: victim.id,
      targetId: victim.ownerId,
      from: victim.position,
    });
    victim.position = { kind: 'BASE' };
    player.knocked++;
    captured = true;
    if (special)
      events.push({
        type: 'HALKI_DIED',
        playerId: victim.ownerId,
        pieceId: victim.id,
      });
  }
  if (captured && !player.homeUnlocked) {
    player.homeUnlocked = true;
    for (const p of s.pieces)
      if (p.ownerId === player.id && p.position.kind === 'HOME_GATE_LOCKED')
        p.position = { ...p.position, kind: 'TRACK' };
    events.push({ type: 'HOME_UNLOCKED', playerId: player.id });
  }
}
/** One decision shared by actual collisions and compulsory activation targets. */
export function canCapture(s: Match, attacker: Piece, defenders: Piece[]) {
  if (
    !defenders.length ||
    defenders.some((p) => teammates(s, attacker.ownerId, p.ownerId))
  )
    return false;
  if (attacker.position.kind === 'HOME_LANE') return false;
  if (
    (attacker.position.kind === 'HALKI_HOME_INVASION' ||
      attacker.position.kind === 'HALKI_HOME_RETURN') &&
    attacker.position.homeSeat === attacker.seat
  )
    return false;
  const shields = shieldTeams(s, defenders);
  if (isHalki(attacker))
    return (
      defenders.length <= 2 && !(shields.length && defenders.some(isHalki))
    );
  if (safe(attacker) || shields.length) return false;
  // A single owner's stack gets no protection, including its Halki pieces.
  return new Set(defenders.map((p) => p.ownerId)).size === 1;
}
function halkiStrike(
  s: Match,
  attacker: Piece,
  defenders: Piece[],
  events: GameEvent[],
) {
  if (canCapture(s, attacker, defenders)) kill(s, attacker, defenders, events);
}
export function resolveDeparture(
  s: Match,
  before: Match,
  movedId: string,
  events: GameEvent[],
) {
  const old = before.pieces.find((p) => p.id === movedId)!;
  if (!onBoard(old)) return;
  const oldGroup = squarePieces(before, old),
    group = squarePieces(s, old);
  if (!group.length) return;
  const waiting = group.filter(isHalki);
  for (const h of waiting) {
    if (!isHalki(h)) continue;
    const oldEnemies = oldGroup.filter(
      (p) => !teammates(s, p.ownerId, h.ownerId),
    );
    const enemies = group.filter(
      (p) => onBoard(p) && !teammates(s, p.ownerId, h.ownerId),
    );
    const shieldLost =
      shieldTeams(before, oldEnemies).length > 0 &&
      !shieldTeams(s, enemies).length;
    if (
      (oldEnemies.length >= 3 || shieldLost) &&
      enemies.length > 0 &&
      enemies.length <= 2
    )
      halkiStrike(s, h, enemies, events);
  }
  if (safe(old)) return;
  const current = squarePieces(s, old),
    oldShields = shieldTeams(before, oldGroup),
    shields = shieldTeams(s, current);
  for (const broken of oldShields.filter((t) => !shields.includes(t))) {
    const victims = current.filter((p) => team(s, p) === broken);
    const enemies = current.filter((p) => team(s, p) !== broken && !isHalki(p));
    if (!victims.length || !enemies.length) continue;
    events.push({
      type: 'SHIELD_BROKEN',
      playerId: old.ownerId,
      pieceId: old.id,
    });
    // Seat/id ordering determines statistics credit only, never who survives.
    const attacker = [...enemies].sort(
      (a, b) => a.seat - b.seat || a.id.localeCompare(b.id),
    )[0];
    if (canCapture(s, attacker, victims)) kill(s, attacker, victims, events);
  }
}
export function resolveArrival(
  s: Match,
  before: Match,
  movedId: string,
  events: GameEvent[],
) {
  const attacker = s.pieces.find((p) => p.id === movedId)!;
  if (!onBoard(attacker)) return;
  const group = squarePieces(s, attacker);
  const enemies = group.filter(
    (p) => !teammates(s, p.ownerId, attacker.ownerId),
  );
  if (isHalki(attacker)) {
    halkiStrike(s, attacker, enemies, events);
    return;
  }
  // Normal movement within the owner's Home cannot attack its invader.
  if (!canCapture(s, attacker, enemies)) return;
  const oldGroup = before.pieces.filter(
    (p) => onBoard(p) && key(p) === key(attacker),
  );
  const ownTeam = team(s, attacker),
    hadShield = shieldTeams(before, oldGroup).includes(ownTeam);
  if (
    hadShield &&
    oldGroup.some((p) => !teammates(s, p.ownerId, attacker.ownerId))
  ) {
    events.push({
      type: 'REINFORCED',
      playerId: attacker.ownerId,
      pieceId: attacker.id,
    });
  }
  kill(s, attacker, enemies, events);
}
export function syncSquares(
  s: Match,
  before?: Match,
  events: GameEvent[] = [],
) {
  const groups = new Map<number, Piece[]>();
  for (const p of s.pieces) {
    if (
      p.position.kind !== 'TRACK' &&
      p.position.kind !== 'HALKI_TRACK' &&
      p.position.kind !== 'HOME_GATE_LOCKED'
    )
      continue;
    if (s.players.find((x) => x.id === p.ownerId)!.forfeited) continue;
    groups.set(p.position.index, [...(groups.get(p.position.index) ?? []), p]);
  }
  s.revenge!.contests = [];
  s.revenge!.shields = [];
  for (const [index, pieces] of groups) {
    const shields = shieldTeams(s, pieces);
    if (shields.length) {
      s.revenge!.shields.push({
        index,
        teams: shields,
        halkiTeams: shields.filter((t) =>
          pieces.some((p) => isHalki(p) && team(s, p) === t),
        ),
      });
      if (before && !before.revenge!.shields.some((x) => x.index === index))
        events.push({ type: 'SHIELD_CREATED', playerId: pieces[0].ownerId });
    }
    if (
      new Set(pieces.map((p) => team(s, p))).size < 2 ||
      (!shields.length &&
        !pieces.some(isHalki) &&
        (safe(pieces[0]) || pieces.length < 3))
    )
      continue;
    s.revenge!.contests.push({
      index,
      pieceIds: pieces.map((p) => p.id),
      shields,
      kind:
        shields.length === 2
          ? 'DOUBLE_SHIELD'
          : pieces.some(isHalki)
            ? 'HALKI'
            : shields.length
              ? 'SHIELD'
              : 'STACK',
    });
    if (before && !before.revenge!.contests.some((x) => x.index === index))
      events.push({
        type: 'CONTEST_CREATED',
        playerId: pieces.at(-1)!.ownerId,
      });
  }
}

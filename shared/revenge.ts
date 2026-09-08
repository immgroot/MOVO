import {
  createMatch,
  legalMoves as knockoutMoves,
  homeCount,
  teamProgress,
  RuleError,
  type Match,
  type Move,
  type Resolution,
  type GameEvent,
} from './game';
import { HOME_GATES, type Seat, type Position } from './topology';
import {
  isHalki,
  resolveArrival,
  resolveDeparture,
  syncSquares,
  canCapture,
  squarePieces,
  UndefinedRevengeRule,
} from './revenge-collision';

function create(
  id: string,
  members: { id: string; name: string; seat: Seat }[],
  timerSeconds: number,
  now: number,
): Match {
  if (members.length !== 4)
    throw new RuleError('REVENGE needs exactly four players.');
  const s = createMatch(id, members, timerSeconds, now, 'KNOCKOUT_2V2');
  s.mode = 'REVENGE';
  for (const p of s.pieces) {
    p.hasUsedHalki = false;
    p.halkiInvadedHomeOwnerId = null;
  }
  s.revenge = {
    version: 2,
    secured: [],
    support: {},
    beneficiaryId: s.currentPlayerId,
    contests: [],
    shields: [],
    rulePending: null,
    diceHistory: [],
    awaitingBonus: false,
    queuedRolls: [],
    activationValue: null,
    endAfterQueue: false,
    diceFlowVersion: 1,
    turnDice: [],
    rollPending: true,
    declinedPairs: [],
    halkiChoice: null,
    previousTurn: null,
  };
  return s;
}
function check(s: Match, actor: string, moving = false) {
  if (s.phase !== 'PLAYING') throw new RuleError('This match has finished.');
  if (s.revenge!.rulePending) throw new RuleError(s.revenge!.rulePending);
  if ((moving ? s.revenge!.beneficiaryId : s.currentPlayerId) !== actor)
    throw new RuleError(
      moving
        ? 'The player being helped chooses their own piece.'
        : 'Wait for your roll turn.',
    );
}
function deadline(s: Match, now: number) {
  s.deadline = s.timerSeconds ? now + s.timerSeconds * 1000 : null;
}
function activePlayers(s: Match) {
  return s.players
    .filter(
      (p) =>
        !p.forfeited &&
        (!s.revenge!.secured.includes(p.id) || s.revenge!.support[p.id]?.ready),
    )
    .map((p) => p.id);
}
function advance(s: Match, now: number, events: GameEvent[]) {
  const r = s.revenge!,
    completed = s.currentPlayerId,
    active = activePlayers(s);
  if (r.turnDice.length)
    r.previousTurn = {
      playerId: completed,
      dice: structuredClone(r.turnDice).map((d) =>
        d.status === 'available' ? { ...d, status: 'ended' as const } : d,
      ),
    };
  for (const [id, support] of Object.entries(r.support)) {
    if (support.ready || id === completed) continue;
    support.pending = support.pending.filter(
      (pid) => pid !== completed && active.includes(pid),
    );
    if (!support.pending.length) {
      support.rotationsLeft--;
      support.ready = support.rotationsLeft === 0;
      support.pending = support.ready ? [] : [...active];
      if (support.ready) events.push({ type: 'SUPPORT_READY', playerId: id });
    }
  }
  const index = s.players.findIndex((p) => p.id === completed);
  for (let step = 1; step <= 4; step++) {
    const p = s.players[(index + step) % 4];
    if (p.forfeited || (r.secured.includes(p.id) && !r.support[p.id]?.ready))
      continue;
    s.currentPlayerId = p.id;
    r.beneficiaryId = r.secured.includes(p.id)
      ? s.players.find((x) => x.id !== p.id && x.team === p.team)!.id
      : p.id;
    break;
  }
  s.dice = null;
  s.consecutiveSixes = 0;
  s.turnNumber++;
  deadline(s, now);
  r.diceHistory = [];
  r.queuedRolls = [];
  r.awaitingBonus = false;
  r.activationValue = null;
  r.endAfterQueue = false;
  r.turnDice = [];
  r.rollPending = true;
  r.declinedPairs = [];
  r.halkiChoice = null;
}
function reversePath(piece: Match['pieces'][number], roll: number): Position[] {
  let at = piece.position;
  const path: Position[] = [];
  for (let i = 0; i < roll; i++) {
    if (at.kind === 'HALKI_TRACK') {
      at =
        at.index === HOME_GATES[at.homeSeat] && at.travelled >= 52
          ? { kind: 'HALKI_HOME_RETURN', homeSeat: at.homeSeat, index: 0 }
          : {
              kind: 'HALKI_TRACK',
              homeSeat: at.homeSeat,
              index: (at.index + 51) % 52,
              travelled: at.travelled + 1,
            };
    } else if (at.kind === 'HALKI_HOME_INVASION') {
      at =
        at.index === 0
          ? {
              kind: 'HALKI_TRACK',
              homeSeat: at.homeSeat,
              index: HOME_GATES[at.homeSeat],
              travelled: 0,
            }
          : { ...at, index: at.index - 1 };
    } else if (at.kind === 'HALKI_HOME_RETURN') {
      at =
        at.index === 4
          ? { kind: 'HOME', homeSeat: at.homeSeat }
          : { ...at, index: at.index + 1 };
    } else if (at.kind === 'HOME') return [];
    else throw new RuleError('Choose a Halki piece.');
    path.push(at);
  }
  return path;
}
function preview(s: Match, m: Move) {
  const next = structuredClone(s),
    events: GameEvent[] = [];
  next.pieces.find((p) => p.id === m.pieceId)!.position = m.path.at(-1)!;
  resolveDeparture(next, s, m.pieceId, events);
  resolveArrival(next, s, m.pieceId, events);
  return events
    .filter(
      (e) =>
        e.type === 'PIECE_KNOCKED' &&
        e.playerId === s.pieces.find((p) => p.id === m.pieceId)!.ownerId,
    )
    .map((e) => e.pieceId!);
}
function candidates(s: Match, actor: string, die: number): Move[] {
  const normalView = {
    ...s,
    mode: 'KNOCKOUT_2V2' as const,
    currentPlayerId: actor,
    pieces: s.pieces.filter((p) => !isHalki(p)),
  };
  const normal = knockoutMoves(normalView, actor, die).map((m) => ({
    ...m,
    knockIds: [] as string[],
  }));
  const special = s.pieces
    .filter((p) => p.ownerId === actor && isHalki(p))
    .map((p) => ({
      pieceId: p.id,
      path: reversePath(p, die),
      knockIds: [] as string[],
      stopsAtGate: false,
    }));
  const all = [...normal, ...special.filter((m) => m.path.length === die)].map(
    (m) => ({ ...m, knockIds: preview(s, m) }),
  );
  const required = all.filter(
    (m) =>
      isHalki(s.pieces.find((p) => p.id === m.pieceId)!) && m.knockIds.length,
  );
  return required.length ? required : all;
}
function legal(s: Match, actor: string, die?: number | null): Move[] {
  if (
    s.phase !== 'PLAYING' ||
    s.revenge!.rulePending ||
    actor !== s.revenge!.beneficiaryId ||
    s.revenge!.secured.includes(actor) ||
    s.revenge!.rollPending
  )
    return [];
  try {
    return poolMoves(s, actor, die);
  } catch (e) {
    if (e instanceof UndefinedRevengeRule) return [];
    throw e;
  }
}
function poolMoves(s: Match, actor: string, die?: number | null): Move[] {
  const activation = pairMoves(s, actor);
  if (activation.length && lastPieceCondition(s, actor)) return activation;
  const normal = s
    .revenge!.turnDice.filter(
      (d) => d.status === 'available' && (die == null || d.value === die),
    )
    .flatMap((d) =>
      candidates(s, actor, d.value).map((m) => ({ ...m, dieId: d.id })),
    );
  const activeKills = normal.filter(
    (m) =>
      isHalki(s.pieces.find((p) => p.id === m.pieceId)!) && m.knockIds.length,
  );
  return [...activation, ...(activeKills.length ? activeKills : normal)];
}
export function lastPieceCondition(s: Match, actor: string) {
  const own = s.pieces.filter((p) => p.ownerId === actor);
  return (
    own.length === 4 &&
    own.filter((p) => p.position.kind === 'HOME').length === 3 &&
    own.filter((p) => p.position.kind !== 'HOME').length === 1
  );
}
function pairMoves(s: Match, actor: string): Move[] {
  const r = s.revenge!;
  return r.turnDice
    .filter(
      (bonus) =>
        bonus.status === 'available' &&
        bonus.bonusOf &&
        !r.declinedPairs.includes(bonus.id),
    )
    .flatMap((bonus) => {
      const parent = r.turnDice.find((d) => d.id === bonus.bonusOf);
      if (!parent || parent.value !== 6 || parent.status !== 'available')
        return [];
      return activationMoves(s, actor, bonus.value).map((m) => ({
        ...m,
        dieId: bonus.id,
        diceIds: [parent.id, bonus.id] as [string, string],
      }));
    });
}
function syncDice(s: Match) {
  const r = s.revenge!,
    pair = r.rollPending ? undefined : pairMoves(s, r.beneficiaryId)[0];
  r.halkiChoice = pair
    ? {
        dieIds: pair.diceIds!,
        required: lastPieceCondition(s, r.beneficiaryId),
      }
    : null;
  r.activationValue = pair
    ? r.turnDice.find((d) => d.id === pair.dieId)!.value
    : null;
  r.awaitingBonus = r.rollPending && r.turnDice.length > 0;
  r.diceHistory = r.turnDice.map((d) => d.value);
  r.queuedRolls = [];
  s.dice = r.rollPending
    ? null
    : (r.turnDice.find((d) => d.status === 'available')?.value ?? null);
}
export function reverseHomeIndex(bonus: number) {
  return Number.isInteger(bonus) && bonus >= 1 && bonus <= 5 ? 5 - bonus : null;
}
function eligible(s: Match, actor: string) {
  return (
    !s.revenge!.secured.includes(actor) &&
    s.pieces.some(
      (p) =>
        p.ownerId === actor &&
        p.position.kind === 'HOME' &&
        p.hasUsedHalki === false,
    ) &&
    homeCount(s, actor) < 4
  );
}
function activationMoves(s: Match, actor: string, bonus: number): Move[] {
  const index = reverseHomeIndex(bonus);
  if (index === null || !eligible(s, actor)) return [];
  const owner = s.players.find((p) => p.id === actor)!;
  const moves: Move[] = [];
  for (const enemy of s.players.filter(
    (p) => p.team !== owner.team && !p.forfeited,
  )) {
    const attacker = {
      ...s.pieces.find((p) => p.ownerId === actor)!,
      position: {
        kind: 'HALKI_HOME_INVASION' as const,
        homeSeat: enemy.seat,
        index,
      },
    };
    const defenders = squarePieces(s, attacker).filter(
      (p) => s.players.find((x) => x.id === p.ownerId)!.team !== owner.team,
    );
    if (!canCapture(s, attacker, defenders)) continue;
    for (const piece of s.pieces.filter(
      (p) =>
        p.ownerId === actor &&
        p.position.kind === 'HOME' &&
        p.hasUsedHalki === false,
    )) {
      const path: Position[] = Array.from({ length: bonus }, (_, i) => ({
        kind: 'HALKI_HOME_INVASION',
        homeSeat: enemy.seat,
        index: 4 - i,
      }));
      moves.push({
        pieceId: piece.id,
        action: 'activate',
        targetId: enemy.id,
        path,
        knockIds: defenders.map((p) => p.id),
        stopsAtGate: false,
      });
    }
  }
  return moves;
}
function prepare(s: Match, now: number, events: GameEvent[]) {
  const r = s.revenge!;
  syncDice(s);
  if (!r.rollPending && !poolMoves(s, r.beneficiaryId).length) {
    const unused = r.turnDice.filter((d) => d.status === 'available');
    if (unused.length) {
      unused.forEach((d) => (d.status = 'unplayable'));
      events.push({ type: 'NO_MOVES', playerId: r.beneficiaryId });
    }
    advance(s, now, events);
  } else deadline(s, now);
}
function roll(
  original: Match,
  actor: string,
  die: number,
  now: number,
): Resolution {
  check(original, actor);
  if (!original.revenge!.rollPending)
    throw new RuleError('Use your available turn dice first.');
  if (!Number.isInteger(die) || die < 1 || die > 6)
    throw new RuleError('Invalid die result.');
  const s = structuredClone(original),
    r = s.revenge!,
    events: GameEvent[] = [
      { type: 'DICE_ROLLED', playerId: actor, value: die },
    ];
  s.revision++;
  s.lastRoll = die;
  s.consecutiveSixes = die === 6 ? s.consecutiveSixes + 1 : 0;
  const parent = r.turnDice.at(-1);
  r.turnDice.push({
    id: `${s.turnNumber}:${r.turnDice.length}`,
    value: die,
    bonusOf: parent?.value === 6 ? parent.id : null,
    status: 'available',
  });
  if (die === 6) s.players.find((p) => p.id === actor)!.sixes++;
  try {
    r.rollPending =
      die === 6 &&
      (candidates(s, r.beneficiaryId, 6).length > 0 ||
        [1, 2, 3, 4, 5].some(
          (b) => activationMoves(s, r.beneficiaryId, b).length,
        ));
    prepare(s, now, events);
  } catch (e) {
    if (!(e instanceof UndefinedRevengeRule)) throw e;
    r.rulePending = e.message;
    s.deadline = null;
    events.push({ type: 'RULE_PENDING', playerId: actor });
  }
  return { state: s, events };
}
function move(
  original: Match,
  actor: string,
  id: string,
  now: number,
  targetId?: string,
  dieId?: string,
): Resolution {
  check(original, actor, true);
  const choices = legal(original, actor).filter((m) => m.pieceId === id);
  const m = choices.find(
    (m) =>
      (!dieId || m.dieId === dieId) &&
      (targetId
        ? m.action === 'activate' && m.targetId === targetId
        : m.action !== 'activate'),
  );
  if (!m) {
    const required =
      original.revenge!.halkiChoice?.required ||
      legal(original, actor).some(
        (m) =>
          isHalki(original.pieces.find((p) => p.id === m.pieceId)!) &&
          m.knockIds.length,
      );
    throw new RuleError(
      required
        ? 'HALKI REQUIRED. Choose a highlighted Halki.'
        : 'That piece cannot use this roll.',
    );
  }
  const s = structuredClone(original),
    r = s.revenge!,
    piece = s.pieces.find((p) => p.id === id)!,
    from = piece.position;
  const events: GameEvent[] = [];
  for (const usedId of m.diceIds ?? [m.dieId!]) {
    const used = r.turnDice.find((d) => d.id === usedId)!;
    used.status = m.action === 'activate' ? 'halki' : 'used';
    used.pieceId = id;
  }
  if (m.action === 'activate') {
    piece.hasUsedHalki = true;
    piece.halkiInvadedHomeOwnerId = m.targetId!;
    events.push({
      type: 'HALKI_ACTIVATED',
      playerId: actor,
      pieceId: id,
      targetId: m.targetId,
    });
  }
  events.push({
    type: 'PIECE_MOVED',
    playerId: actor,
    pieceId: id,
    from,
    path: m.path,
  });
  piece.position = m.path.at(-1)!;
  s.players.find((p) => p.id === actor)!.distance += m.path.length;
  resolveDeparture(s, original, id, events);
  resolveArrival(s, original, id, events);
  syncSquares(s, original, events);
  if (m.stopsAtGate && !s.players.find((p) => p.id === actor)!.homeUnlocked)
    events.push({ type: 'HOME_LOCKED', playerId: actor, pieceId: id });
  if (piece.position.kind === 'HOME')
    events.push({ type: 'PIECE_SECURED', playerId: actor, pieceId: id });
  if (m.path.some((p) => p.kind === 'HOME_LANE' && p.index === 0))
    events.push({ type: 'HOME_ENTERED', playerId: actor, pieceId: id });
  const finished = homeCount(s, actor) === 4;
  if (finished && !r.secured.includes(actor)) {
    r.secured.push(actor);
    r.support[actor] = {
      rotationsLeft: 4,
      pending: activePlayers(s),
      ready: false,
    };
    events.push({ type: 'SUPPORT_WAIT', playerId: actor });
  }
  s.revision++;
  const owner = s.players.find((p) => p.id === actor)!;
  if (teamProgress(s, owner.team!) === 8) {
    s.phase = 'FINISHED';
    s.winner = actor;
    s.winnerTeam = owner.team;
    s.winReason = 'HOME';
    s.deadline = null;
    s.dice = null;
    events.push({ type: 'TEAM_WON', playerId: actor });
  } else if (!finished) {
    try {
      prepare(s, now, events);
    } catch (e) {
      if (!(e instanceof UndefinedRevengeRule)) throw e;
      r.rulePending = e.message;
      s.deadline = null;
      events.push({ type: 'RULE_PENDING', playerId: actor });
    }
  } else advance(s, now, events);
  return { state: s, events };
}
export function declineHalki(
  original: Match,
  actor: string,
  now = Date.now(),
): Resolution {
  if (original.mode !== 'REVENGE')
    throw new RuleError('This choice is only available in Revenge.');
  check(original, actor, true);
  const options = pairMoves(original, actor);
  if (original.revenge!.rollPending || !options.length)
    throw new RuleError('No Halki choice is available.');
  if (lastPieceCondition(original, actor))
    throw new RuleError('HALKI REQUIRED. Only one unfinished piece remains.');
  const s = structuredClone(original),
    events: GameEvent[] = [];
  s.revenge!.declinedPairs.push(...new Set(options.map((m) => m.dieId!)));
  s.revision++;
  prepare(s, now, events);
  return { state: s, events };
}
function timeout(original: Match, now: number): Resolution {
  if (
    original.phase !== 'PLAYING' ||
    original.deadline === null ||
    now < original.deadline ||
    original.revenge!.rulePending
  )
    return { state: original, events: [] };
  const s = structuredClone(original),
    events: GameEvent[] = [
      { type: 'TURN_TIMEOUT', playerId: s.currentPlayerId },
    ];
  s.revision++;
  advance(s, now, events);
  return { state: s, events };
}
function forfeit(original: Match, actor: string, _now?: number): Resolution {
  const player = original.players.find((p) => p.id === actor);
  if (!player || player.forfeited || original.phase !== 'PLAYING')
    return { state: original, events: [] };
  const s = structuredClone(original),
    p = s.players.find((p) => p.id === actor)!;
  p.forfeited = true;
  s.phase = 'FINISHED';
  s.winner = s.players.find((x) => x.team !== p.team)!.id;
  s.winnerTeam = s.players.find((x) => x.id === s.winner)!.team;
  s.winReason = 'FORFEIT';
  s.dice = null;
  s.deadline = null;
  s.revision++;
  return {
    state: s,
    events: [
      { type: 'PLAYER_FORFEITED', playerId: actor },
      { type: 'TEAM_WON', playerId: s.winner! },
    ],
  };
}
export const revengeRules = {
  createMatch: create,
  legalMoves: legal,
  roll,
  move,
  timeout,
  forfeit,
};

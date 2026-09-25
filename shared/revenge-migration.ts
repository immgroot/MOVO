import { teammates, type Match } from './game';
import { isRevenge, normalizeMode } from './modes';
import { HOME_GATES, isOuter, type Seat } from './topology';
import { isHalki, syncSquares } from './revenge-collision';

/** Older saves cannot prove that an inactive piece never used Halki. Fail closed. */
export function migrateRevenge(s: Match): boolean {
  if (!isRevenge(s.mode) || !s.revenge) return false;
  const previous = JSON.stringify(s);
  s.mode = normalizeMode(s.mode);
  let unknownCaptureHistory = false;
  const previousRules = Number(s.revenge.version);
  const legacy = previousRules < 2;
  for (const player of s.players) {
    if (legacy || typeof player.homeUnlocked !== 'boolean')
      player.homeUnlocked = player.knocked > 0;
  }
  let missingRoute = false;
  for (const piece of s.pieces) {
    const owner = s.players.find((p) => p.id === piece.ownerId)!;
    if (typeof piece.hasCaptured !== 'boolean') {
      // An entered Home proves capture permission; aggregate owner kills do not.
      piece.hasCaptured =
        isHalki(piece) ||
        piece.position.kind === 'HOME' ||
        piece.position.kind === 'HOME_LANE';
      if (!isHalki(piece) && owner.knocked > 0 && s.phase === 'PLAYING')
        unknownCaptureHistory = true;
    }
    if (typeof piece.hasUsedHalki !== 'boolean') piece.hasUsedHalki = true;
    piece.halkiInvadedHomeOwnerId ??= null;
    piece.homeEntryWaived ??= false;
    if (
      isOuter(piece.position) &&
      !piece.hasCaptured &&
      !piece.homeEntryWaived &&
      piece.position.travelled >= 50
    ) {
      piece.position = {
        kind: 'HOME_GATE_LOCKED',
        index: HOME_GATES[piece.seat],
        travelled: 50,
      };
    }
    if (!isHalki(piece)) continue;
    piece.hasUsedHalki = true;
    const at = piece.position;
    let target = s.players.find(
      (p) =>
        p.id === piece.halkiInvadedHomeOwnerId && !teammates(s, p.id, owner.id),
    );
    if (!target && 'homeSeat' in at)
      target = s.players.find(
        (p) => p.seat === at.homeSeat && !teammates(s, p.id, owner.id),
      );
    if (!target && at.kind === 'HALKI_TRACK') {
      const gate = (at.index + at.travelled) % 52;
      target = s.players.find(
        (p) => HOME_GATES[p.seat] === gate && !teammates(s, p.id, owner.id),
      );
    }
    if (!target) {
      missingRoute = true;
      // Preserve the old drawn lane while disabling an unprovable route.
      const savedPosition = at as { homeSeat?: Seat };
      if (
        (at.kind === 'HALKI_HOME_RETURN' || at.kind === 'HALKI_TRACK') &&
        savedPosition.homeSeat === undefined
      )
        savedPosition.homeSeat = piece.seat;
      continue;
    }
    piece.halkiInvadedHomeOwnerId = target.id;
    if (
      at.kind === 'HALKI_HOME_INVASION' ||
      at.kind === 'HALKI_TRACK' ||
      at.kind === 'HALKI_HOME_RETURN'
    )
      at.homeSeat = target.seat;
  }
  if (
    missingRoute ||
    unknownCaptureHistory ||
    (s.revenge.activationValue !== null &&
      !s.pieces.some(
        (p) =>
          p.ownerId === s.revenge!.beneficiaryId &&
          p.position.kind === 'HOME' &&
          p.hasUsedHalki === false,
      ))
  ) {
    s.revenge.rulePending =
      'This older match lacks the per-piece capture or Halki history needed to continue safely. Start a new match with the corrected rules.';
    s.deadline = null;
  }
  s.revenge.version = 3;
  const r = s.revenge;
  if (r.diceFlowVersion !== 1 || !Array.isArray(r.turnDice)) {
    const history = [...(r.diceHistory ?? [])];
    const pending =
      r.activationValue !== null
        ? [6, r.activationValue]
        : [
            ...(r.awaitingBonus ? [6] : s.dice !== null ? [s.dice] : []),
            ...(r.queuedRolls ?? []),
          ];
    if (history.length < pending.length)
      history.push(...pending.slice(history.length));
    r.turnDice = history.map((value, i) => ({
      id: `${s.turnNumber}:${i}`,
      value,
      bonusOf:
        i > 0 && history[i - 1] === 6 ? `${s.turnNumber}:${i - 1}` : null,
      status: i >= history.length - pending.length ? 'available' : 'used',
    }));
    r.rollPending =
      r.awaitingBonus ||
      (r.activationValue === null && (s.dice === null || history.at(-1) === 6));
    r.declinedPairs = [];
    r.halkiChoice = null;
    r.previousTurn = null;
    r.diceFlowVersion = 1;
    if (r.activationValue !== null && r.turnDice.length >= 2)
      r.halkiChoice = {
        dieIds: [r.turnDice.at(-2)!.id, r.turnDice.at(-1)!.id],
        required:
          s.pieces.filter(
            (p) => p.ownerId === r.beneficiaryId && p.position.kind === 'HOME',
          ).length === 3,
      };
    r.queuedRolls = [];
    r.awaitingBonus = r.rollPending && history.length > 0;
    s.dice = r.rollPending
      ? null
      : (r.turnDice.find((d) => d.status === 'available')?.value ?? null);
  }
  if (previousRules < 3 && s.phase === 'PLAYING' && r.turnDice.length > 0) {
    r.rulePending =
      'This older match has a turn collected under the previous dice rules. Start a new match to use the corrected ordered dice and six-streak rules.';
    s.deadline = null;
  }
  syncSquares(s);
  return JSON.stringify(s) !== previous;
}

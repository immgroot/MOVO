import type { Match, GameEvent } from './game';
import { HOME_GATES } from './topology';
/** Structural proof of a global deadlock: there are no Base, moving, Home-lane
 * or active Halki pieces at all. Finished pieces cannot move without a killable
 * Home-lane victim, and distinct locked Home doors cannot attack one another.
 * Checking the entire roster (not the current die) also rules out future sixes
 * reopening Base pieces, future captures, and future Halki summon pairs. */
export function escapeSoloStalemate(
  s: Match,
  events: GameEvent[] = [],
): boolean {
  if (
    s.mode !== 'REVENGE_SOLO' ||
    s.phase !== 'PLAYING' ||
    s.revenge?.rulePending
  )
    return false;
  const active = s.players.filter((p) => !p.forfeited);
  if (active.length < 2) return false;
  const unfinished = s.pieces.filter(
    (p) =>
      active.some((owner) => owner.id === p.ownerId) &&
      p.position.kind !== 'HOME',
  );
  if (
    !unfinished.length ||
    !unfinished.every(
      (p) =>
        p.position.kind === 'HOME_GATE_LOCKED' &&
        p.position.index === HOME_GATES[p.seat] &&
        p.position.travelled >= 50 &&
        p.hasCaptured === false &&
        !p.homeEntryWaived,
    )
  )
    return false;
  for (const p of unfinished) p.homeEntryWaived = true;
  events.push({
    type: 'STALEMATE_ESCAPED',
    playerId: s.currentPlayerId,
    value: unfinished.length,
  });
  return true;
}

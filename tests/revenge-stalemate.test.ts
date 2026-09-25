import { it, expect } from 'vitest';
import {
  createMatch,
  resolveRoll,
  resolveMove,
  legalMoves,
  type Match,
  type Mode,
} from '../shared/game';
import { escapeSoloStalemate } from '../shared/revenge-stalemate';
import { migrateRevenge } from '../shared/revenge-migration';
import { HOME_GATES, type Seat } from '../shared/topology';
function trapped(mode: Mode = 'REVENGE_SOLO') {
  const count = mode === 'REVENGE_SOLO' ? 2 : 4;
  const s = createMatch(
    'stalemate',
    Array.from({ length: count }, (_, seat) => ({
      id: 'p' + seat,
      name: 'P' + seat,
      seat: seat as Seat,
    })),
    0,
    0,
    mode,
  );
  for (const p of s.pieces)
    p.position =
      p.number === 3
        ? { kind: 'HOME_GATE_LOCKED', index: HOME_GATES[p.seat], travelled: 50 }
        : { kind: 'HOME' };
  return s;
}
function die(s: Match, value: number) {
  s.currentPlayerId = 'p0';
  s.revenge!.beneficiaryId = 'p0';
  s.dice = value;
  Object.assign(s.revenge!, {
    rollPending: false,
    turnDice: [{ id: '1:0', value, bonusOf: null, status: 'available' }],
  });
  return s;
}
it('one stuck player cannot waive Home while an enemy can still move', () => {
  const s = trapped();
  s.pieces[7].position = { kind: 'TRACK', index: 20, travelled: 7 };
  expect(escapeSoloStalemate(s)).toBe(false);
  expect(s.pieces[3].homeEntryWaived).toBe(false);
  expect(legalMoves(die(s, 1), 'p0')).toEqual([]);
});
it('a Base piece with a future six prevents an apparent current-roll deadlock', () => {
  const s = trapped();
  s.pieces[7].position = { kind: 'BASE' };
  die(s, 1);
  expect(legalMoves(s, 'p0')).toEqual([]);
  expect(escapeSoloStalemate(s)).toBe(false);
});
it('a currently legal capture prevents escape', () => {
  const s = trapped();
  s.pieces[2].position = { kind: 'TRACK', index: 7, travelled: 7 };
  s.pieces[6].position = { kind: 'TRACK', index: 10, travelled: 10 };
  die(s, 3);
  expect(legalMoves(s, 'p0').some((m) => m.knockIds.length)).toBe(true);
  expect(escapeSoloStalemate(s)).toBe(false);
});
it('a valid Halki Home action prevents escape, even if all ordinary owned pieces are locked', () => {
  const s = trapped();
  s.pieces[7].position = { kind: 'HOME_LANE', index: 1 };
  s.pieces[7].hasCaptured = true;
  const first = resolveRoll(s, 'p0', 6, 0).state;
  const second = resolveRoll(first, 'p0', 4, 0).state;
  expect(second.revenge!.halkiChoice?.required).toBe(true);
  expect(legalMoves(second, 'p0').some((m) => m.action === 'activate')).toBe(
    true,
  );
  expect(escapeSoloStalemate(second)).toBe(false);
  expect(second.pieces[3].homeEntryWaived).toBe(false);
});
it('a future Home action or an active Halki also prevents escape regardless of current dice', () => {
  for (const kind of ['HOME_LANE', 'HALKI_TRACK'] as const) {
    const s = trapped();
    s.pieces[7].position =
      kind === 'HOME_LANE'
        ? { kind, index: 4 }
        : { kind, index: 11, travelled: 0, homeSeat: 0 };
    expect(escapeSoloStalemate(s)).toBe(false);
  }
});
it('true global deadlock waives only trapped pieces, without moving, finishing, or crediting captures', () => {
  const s = die(trapped(), 2);
  const before = structuredClone(s);
  expect(escapeSoloStalemate(s)).toBe(true);
  expect(s.pieces.map((p) => p.position)).toEqual(
    before.pieces.map((p) => p.position),
  );
  expect(s.pieces.filter((p) => p.homeEntryWaived).map((p) => p.id)).toEqual([
    'p0:3',
    'p1:3',
  ]);
  expect(s.players).toEqual(before.players);
  expect(s.pieces.every((p) => !p.hasCaptured)).toBe(true);
  expect(s.currentPlayerId).toBe(before.currentPlayerId);
  expect(s.revenge!.turnDice).toEqual(before.revenge!.turnDice);
  expect(s.phase).toBe('PLAYING');
  expect(escapeSoloStalemate(s)).toBe(false);
  expect(migrateRevenge(JSON.parse(JSON.stringify(s)))).toBe(false);
});
it('the authoritative last gate arrival activates escape and then preserves normal turn order', () => {
  const s = die(trapped(), 1);
  s.pieces[3].position = { kind: 'TRACK', index: 49, travelled: 49 };
  const r = resolveMove(s, 'p0', 'p0:3', 0);
  expect(r.events.filter((e) => e.type === 'STALEMATE_ESCAPED')).toHaveLength(
    1,
  );
  expect(r.state.pieces[3].position.kind).toBe('HOME_GATE_LOCKED');
  expect(r.state.pieces[3].homeEntryWaived).toBe(true);
  expect(r.state.currentPlayerId).toBe('p1');
  expect(r.state.phase).toBe('PLAYING');
});
it('waived pieces still use exact Home movement with no overshoot or instant finish', () => {
  let s = trapped();
  escapeSoloStalemate(s);
  die(s, 3);
  s = resolveMove(s, 'p0', 'p0:3', 0).state;
  expect(s.pieces[3].position).toEqual({ kind: 'HOME_LANE', index: 2 });
  die(s, 4);
  expect(legalMoves(s, 'p0')).toEqual([]);
  die(s, 3);
  const end = resolveMove(s, 'p0', 'p0:3', 0).state;
  expect(end.phase).toBe('FINISHED');
  expect(end.winner).toBe('p0');
  expect(end.players[0].knocked).toBe(0);
});
it('Revenge Team never receives the Solo escape', () => {
  const s = trapped('REVENGE_TEAM'),
    before = structuredClone(s);
  expect(escapeSoloStalemate(s)).toBe(false);
  expect(s).toEqual(before);
});
it('a captured-credit gate piece or a wrong door prevents a false global waiver', () => {
  const s = trapped();
  s.pieces[7].hasCaptured = true;
  expect(escapeSoloStalemate(s)).toBe(false);
  s.pieces[7].hasCaptured = false;
  s.pieces[7].position = { kind: 'HOME_GATE_LOCKED', index: 50, travelled: 50 };
  expect(escapeSoloStalemate(s)).toBe(false);
});

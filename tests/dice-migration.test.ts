import { it, expect } from 'vitest';
import { createMatch, resolveRoll, resolveMove } from '../shared/game';
import { migrateRevenge } from '../shared/revenge-migration';
import type { Seat } from '../shared/topology';
const game = () =>
  createMatch(
    'migration',
    [0, 1, 2, 3].map((seat) => ({
      id: `p${seat}`,
      name: `Player ${seat}`,
      seat: seat as Seat,
    })),
    0,
    0,
    'REVENGE',
  );
it('restores legacy 6+4 as two available values without manufacturing a replacement', () => {
  const s = game();
  Reflect.deleteProperty(s.revenge!, 'diceFlowVersion');
  s.revenge!.diceHistory = [6, 4];
  s.revenge!.queuedRolls = [4];
  s.dice = 6;
  expect(migrateRevenge(s)).toBe(true);
  expect(s.revenge!.turnDice.map((d) => d.value)).toEqual([6, 4]);
  expect(s.revenge!.turnDice.every((d) => d.status === 'available')).toBe(true);
  expect(s.revenge!.rollPending).toBe(false);
  expect(migrateRevenge(s)).toBe(false);
});
it('a legacy spent six is never resurrected for a new pair', () => {
  const s = game();
  Reflect.deleteProperty(s.revenge!, 'diceFlowVersion');
  s.revenge!.diceHistory = [6];
  s.dice = null;
  s.revenge!.awaitingBonus = false;
  migrateRevenge(s);
  const r = resolveRoll(s, 'p0', 4, 0);
  expect(r.state.revenge!.previousTurn!.dice.map((d) => d.status)).toEqual([
    'used',
    'unplayable',
  ]);
});
it('a pending legacy bonus retains its real parent and original six', () => {
  const s = game();
  Reflect.deleteProperty(s.revenge!, 'diceFlowVersion');
  s.revenge!.diceHistory = [6];
  s.revenge!.awaitingBonus = true;
  s.dice = null;
  migrateRevenge(s);
  const r = resolveRoll(s, 'p0', 4, 0);
  expect(r.state.revenge!.turnDice.map((d) => d.bonusOf)).toEqual([
    null,
    '1:0',
  ]);
  expect(r.state.revenge!.turnDice.every((d) => d.status === 'available')).toBe(
    true,
  );
});
it('current saves retain consumed dice and exact bonus parent IDs unchanged', () => {
  let s = resolveRoll(
    resolveRoll(resolveRoll(game(), 'p0', 6, 0).state, 'p0', 6, 0).state,
    'p0',
    4,
    0,
  ).state;
  s = resolveMove(s, 'p0', 'p0:0', 0, undefined, '1:0').state;
  const restored = JSON.parse(JSON.stringify(s));
  expect(migrateRevenge(restored)).toBe(false);
  expect(restored).toEqual(s);
});

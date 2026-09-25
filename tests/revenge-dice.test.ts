import { describe, it, expect } from 'vitest';
import {
  createMatch,
  resolveRoll,
  resolveMove,
  legalMoves,
  type Match,
} from '../shared/game';
import { declineHalki } from '../shared/revenge';
import type { Seat } from '../shared/topology';
const game = () =>
  createMatch(
    'dice',
    ['GROOT', 'KIV', 'NIDA', 'NOOR'].map((name, seat) => ({
      id: `p${seat}`,
      name,
      seat: seat as Seat,
    })),
    0,
    0,
    'REVENGE',
  );
const chain = (s: Match, values: number[], actor = 'p0') =>
  values.reduce((next, value) => resolveRoll(next, actor, value, 0).state, s);
const spend = (s: Match, index: number, piece = 'p0:0', actor = 'p0') =>
  resolveMove(s, actor, piece, 0, undefined, s.revenge!.turnDice[index].id)
    .state;
function target(finished = 2) {
  const s = game();
  for (let i = 0; i < finished; i++) s.pieces[i].position = { kind: 'HOME' };
  s.pieces[3].position = { kind: 'TRACK', index: 1, travelled: 1 };
  s.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
  return s;
}
describe('Revenge turn dice and unlimited sixes', () => {
  it.each([1, 2, 4, 5, 7, 8])(
    '%i sixes stay playable and each earns its bonus',
    (count) => {
      let s = game();
      for (let i = 0; i < count; i++) {
        const r = resolveRoll(s, 'p0', 6, 0);
        s = r.state;
        expect(r.events.some((e) => e.type === 'SIX_BURNED')).toBe(false);
        expect(s.revenge!.rollPending).toBe(true);
        expect(s.revenge!.turnDice).toHaveLength(i + 1);
        expect(s.revenge!.turnDice.every((d) => d.status === 'available')).toBe(
          true,
        );
        expect(s.consecutiveSixes).toBe(i + 1);
        expect(legalMoves(s, 'p0')).toEqual([]);
      }
      s = chain(s, [1]);
      expect(s.revenge!.turnDice.map((d) => d.value)).toEqual([
        ...Array(count).fill(6),
        1,
      ]);
      for (let i = 0; i < count; i++) {
        s = spend(s, i);
        expect(s.currentPlayerId).toBe('p0');
        expect(s.revenge!.turnDice[i].status).toBe('used');
      }
      expect(s.pieces[0].position).toMatchObject({
        kind: 'TRACK',
        index: (count - 1) * 6,
      });
      s = spend(s, count);
      expect(s.currentPlayerId).toBe('p1');
      expect(
        s.revenge!.previousTurn!.dice.every((d) => d.status === 'used'),
      ).toBe(true);
    },
  );
  it.each(['empty', 'three defenders', 'protected'] as const)(
    '%s Home never consumes dice for Halki',
    (kind) => {
      let s = target(1);
      if (kind === 'empty') s.pieces[4].position = { kind: 'BASE' };
      if (kind === 'three defenders')
        for (const i of [5, 6])
          s.pieces[i].position = { kind: 'HOME_LANE', index: 1 };
      if (kind === 'protected')
        s.pieces[12].position = {
          kind: 'HALKI_HOME_INVASION',
          homeSeat: 1,
          index: 1,
        };
      s = chain(s, [6, 6, 6, 6, 6, 4]);
      expect(s.revenge!.halkiChoice).toBeNull();
      expect(s.revenge!.turnDice.every((d) => d.status === 'available')).toBe(
        true,
      );
      for (let i = 0; i < 6; i++) s = spend(s, i, 'p0:3');
      expect(s.pieces[0].position.kind).toBe('HOME');
      expect(s.pieces[0].hasUsedHalki).toBe(false);
      expect(s.revenge!.previousTurn!.dice.map((d) => d.value)).toEqual([
        6, 6, 6, 6, 6, 4,
      ]);
    },
  );
  it('five sixes pair only the last six with four and keep earlier sixes', () => {
    let s = chain(target(3), [6, 6, 6, 6, 6, 4]);
    expect(s.revenge!.halkiChoice).toEqual({
      dieIds: ['1:4', '1:5'],
      required: true,
    });
    expect(() => spend(s, 0, 'p0:3')).toThrow(/HALKI REQUIRED/);
    s = resolveMove(s, 'p0', 'p0:0', 0, 'p1', '1:5').state;
    expect(s.revenge!.turnDice.map((d) => d.status)).toEqual([
      'available',
      'available',
      'available',
      'available',
      'halki',
      'halki',
    ]);
    for (let i = 0; i < 4; i++) s = spend(s, i, 'p0:3');
    expect(s.pieces[3].position).toMatchObject({ index: 25 });
    expect(s.currentPlayerId).toBe('p1');
  });
  it('a mismatched Home pair preserves independent six and four movements', () => {
    const start = target(1);
    start.pieces[4].position = { kind: 'HOME_LANE', index: 0 };
    let s = chain(start, [6, 4]);
    expect(s.revenge!.halkiChoice).toBeNull();
    s = spend(s, 0, 'p0:3');
    s = spend(s, 1, 'p0:3');
    expect(s.pieces[3].position).toMatchObject({ index: 11 });
    expect(s.pieces[0].position.kind).toBe('HOME');
  });
  it('helper rolls the chain and only the beneficiary consumes dice', () => {
    let s = game();
    s.pieces.slice(0, 4).forEach((p) => (p.position = { kind: 'HOME' }));
    s.revenge!.secured = ['p0'];
    s.revenge!.support.p0 = { rotationsLeft: 0, pending: [], ready: true };
    s.revenge!.beneficiaryId = 'p2';
    s = chain(s, [6, 6, 6, 6, 6, 1]);
    expect(() => spend(s, 0, 'p2:0')).toThrow();
    for (let i = 0; i < 6; i++) s = spend(s, i, 'p2:0', 'p2');
    expect(s.pieces.slice(0, 4).every((p) => p.position.kind === 'HOME')).toBe(
      true,
    );
    expect(s.pieces[8].position).toMatchObject({ index: 51 });
  });
  it('6+4 opens a Base piece then moves that same piece four', () => {
    let s = chain(game(), [6, 4]);
    s = spend(s, 0);
    expect(s.pieces[0].position).toMatchObject({ index: 0 });
    s = spend(s, 1);
    expect(s.pieces[0].position).toMatchObject({ index: 4 });
  });
  it('different pieces use separate dice in their original order', () => {
    const start = game();
    start.pieces[1].position = { kind: 'TRACK', index: 3, travelled: 3 };
    let s = chain(start, [6, 4]);
    expect(() => spend(s, 1, 'p0:1')).toThrow();
    s = spend(s, 0);
    expect(s.revenge!.turnDice.map((d) => d.status)).toEqual([
      'used',
      'available',
    ]);
    s = spend(s, 1, 'p0:1');
    expect(s.pieces[0].position).toMatchObject({ index: 0 });
    expect(s.pieces[1].position).toMatchObject({ index: 7 });
  });
  it.each([1, 2])(
    '%i finished pieces produce optional Halki with normal choices',
    (n) => {
      const s = chain(target(n), [6, 4]);
      expect(s.revenge!.halkiChoice?.required).toBe(false);
      expect(legalMoves(s, 'p0').some((m) => m.action === 'activate')).toBe(
        true,
      );
      expect(legalMoves(s, 'p0').some((m) => !m.action)).toBe(true);
    },
  );
  it('optional decline preserves finished pieces, targets and both dice', () => {
    const original = chain(target(), [6, 4]);
    let s = declineHalki(original, 'p0', 0).state;
    expect(s.revenge!.halkiChoice).toBeNull();
    expect(s.revenge!.turnDice.map((d) => d.status)).toEqual([
      'available',
      'available',
    ]);
    expect(s.pieces).toEqual(original.pieces);
    s = spend(s, 0, 'p0:3');
    s = spend(s, 1, 'p0:3');
    expect(s.pieces[0].hasUsedHalki).toBe(false);
    expect(s.pieces[4].position.kind).toBe('HOME_LANE');
  });
  it('optional accept consumes 6B+4 and leaves 6A playable', () => {
    let s = chain(target(), [6, 6, 4]);
    expect(s.revenge!.turnDice.map((d) => d.bonusOf)).toEqual([
      null,
      '1:0',
      '1:1',
    ]);
    s = resolveMove(s, 'p0', 'p0:0', 0, 'p1', '1:2').state;
    expect(s.revenge!.turnDice.map((d) => d.status)).toEqual([
      'available',
      'halki',
      'halki',
    ]);
    expect(s.pieces[0].hasUsedHalki).toBe(true);
    expect(s.pieces[4].position.kind).toBe('BASE');
    expect(s.currentPlayerId).toBe('p0');
    s = spend(s, 0, 'p0:3');
    expect(s.currentPlayerId).toBe('p1');
  });
  it('exactly 3 finished + 1 unfinished makes a valid birth compulsory', () => {
    const s = chain(target(3), [6, 4]);
    expect(s.revenge!.halkiChoice?.required).toBe(true);
    expect(legalMoves(s, 'p0').every((m) => m.action === 'activate')).toBe(
      true,
    );
    expect(() => declineHalki(s, 'p0', 0)).toThrow(/HALKI REQUIRED/);
    expect(() => spend(s, 0, 'p0:3')).toThrow(/HALKI REQUIRED/);
  });
  it('three finished without a matching victim has no required Halki', () => {
    const s = target(3);
    s.pieces[4].position = { kind: 'BASE' };
    const rolled = chain(s, [6, 4]);
    expect(rolled.revenge!.halkiChoice).toBeNull();
    expect(legalMoves(rolled, 'p0').some((m) => m.pieceId === 'p0:3')).toBe(
      true,
    );
  });
  it('three used finished pieces cannot create new Halki', () => {
    const s = target(3);
    s.pieces.slice(0, 3).forEach((p) => (p.hasUsedHalki = true));
    const rolled = chain(s, [6, 4]);
    expect(rolled.revenge!.halkiChoice).toBeNull();
    expect(legalMoves(rolled, 'p0').every((m) => m.action !== 'activate')).toBe(
      true,
    );
  });
  it('permanent 4/4 disables birth with an occupied enemy Home', () => {
    const s = target(4);
    s.pieces[3].position = { kind: 'HOME' };
    s.revenge!.secured = ['p0'];
    const r = resolveRoll(s, 'p0', 6, 0);
    expect(r.state.revenge!.halkiChoice).toBeNull();
    expect(
      r.state.pieces.slice(0, 4).every((p) => p.position.kind === 'HOME'),
    ).toBe(true);
  });
  it.each([2, 3])(
    'multiple targets stay selectable with %i finished pieces',
    (n) => {
      const s = target(n);
      s.pieces[12].position = { kind: 'HOME_LANE', index: 1 };
      const rolled = chain(s, [6, 4]);
      expect(
        new Set(
          legalMoves(rolled, 'p0')
            .filter((m) => m.action === 'activate')
            .map((m) => m.targetId),
        ),
      ).toEqual(new Set(['p1', 'p3']));
      expect(rolled.revenge!.halkiChoice?.required).toBe(n === 3);
    },
  );
  it('rejects reused/forged dice and extra rolls after the chain ends', () => {
    let s = chain(game(), [6, 4]);
    expect(() => resolveRoll(s, 'p0', 6, 0)).toThrow(/available turn dice/);
    expect(() =>
      resolveMove(s, 'p0', 'p0:0', 0, undefined, 'forged'),
    ).toThrow();
    s = spend(s, 0);
    expect(() => spend(s, 0)).toThrow();
    expect(s.revenge!.turnDice[1].status).toBe('available');
  });
  it('keeps an initially unusable four until a six opens a piece first', () => {
    const s = chain(game(), [6, 4]);
    expect(s.revenge!.turnDice[1].status).toBe('available');
    expect(() => spend(s, 1)).toThrow();
    expect(spend(spend(s, 0), 1).pieces[0].position).toMatchObject({
      index: 4,
    });
  });
});

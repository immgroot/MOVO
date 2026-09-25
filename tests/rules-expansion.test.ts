import { describe, it, expect } from 'vitest';
import {
  createMatch,
  legalMoves,
  resolveMove,
  resolveRoll,
  resolveForfeit,
  teammates,
  type Match,
  type Mode,
} from '../shared/game';
import { declineHalki } from '../shared/revenge';
import {
  canCapture,
  shieldTeams,
  syncSquares,
} from '../shared/revenge-collision';
import { migrateRevenge } from '../shared/revenge-migration';
import { type Seat, type Position } from '../shared/topology';
const members = [0, 1, 2, 3].map((seat) => ({
  id: 'p' + seat,
  name: 'Player ' + seat,
  seat: seat as Seat,
}));
const game = (mode: Mode = 'REVENGE_TEAM', count = 4) =>
  createMatch('expansion', members.slice(0, count), 0, 0, mode);
const track = (index: number, travelled = 10): Position => ({
  kind: 'TRACK',
  index,
  travelled,
});
function ready(s: Match, value: number) {
  s.dice = value;
  if (s.revenge)
    Object.assign(s.revenge, {
      rollPending: false,
      turnDice: [{ id: '1:0', value, bonusOf: null, status: 'available' }],
    });
  return s;
}
const chain = (s: Match, values: number[]) =>
  values.reduce(
    (state, value) => resolveRoll(state, state.currentPlayerId, value, 0).state,
    s,
  );
function target(mode: Mode, finished = 2) {
  const s = game(mode);
  for (let i = 0; i < finished; i++) s.pieces[i].position = { kind: 'HOME' };
  s.pieces[3].position = track(1, 1);
  s.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
  return s;
}
describe.each(['REVENGE_TEAM', 'REVENGE_SOLO'] as Mode[])(
  '%s exact requested dice rules',
  (mode) => {
    it.each([
      [1, 5],
      [2, 5],
      [3, 5],
      [4, 3],
      [5, 2],
      [6, 5],
      [7, 5],
      [8, 4],
      [9, 2],
      [12, 3],
    ])('collects %i sixes before non-six %i', (count, final) => {
      let s = game(mode);
      s.pieces[0].position = track(1, 1);
      for (let i = 1; i <= count; i++) {
        const r = resolveRoll(s, 'p0', 6, 0);
        s = r.state;
        expect(r.events.some((e) => e.type === 'SIX_BURNED')).toBe(false);
        expect(s.revenge!.rollPending).toBe(true);
        expect(s.revenge!.turnDice.every((d) => d.status === 'available')).toBe(
          true,
        );
        expect(legalMoves(s, 'p0')).toEqual([]);
      }
      const r = resolveRoll(s, 'p0', final, 0);
      s = r.state;
      const burned = count % 3 === 0;
      expect(s.revenge!.turnDice.map((d) => d.value)).toEqual([
        ...Array(count).fill(6),
        final,
      ]);
      expect(new Set(s.revenge!.turnDice.map((d) => d.id)).size).toBe(
        count + 1,
      );
      expect(
        s
          .revenge!.turnDice.slice(0, -1)
          .every((d) => d.status === (burned ? 'burned' : 'available')),
      ).toBe(true);
      expect(s.revenge!.turnDice.at(-1)!.status).toBe('available');
      expect(r.events.some((e) => e.type === 'SIX_BURNED')).toBe(burned);
      expect(new Set(legalMoves(s, 'p0').map((m) => m.dieId))).toEqual(
        new Set([burned ? '1:' + count : '1:0']),
      );
    });
    it('rejects the later three until a legal six has been spent', () => {
      const s = target(mode, 1);
      s.pieces[1].position = { kind: 'HOME_LANE', index: 2 };
      s.pieces[1].hasCaptured = true;
      const rolled = chain(s, [6, 3]);
      expect(() =>
        resolveMove(rolled, 'p0', 'p0:1', 0, undefined, '1:1'),
      ).toThrow();
      const first = resolveMove(
        rolled,
        'p0',
        'p0:3',
        0,
        undefined,
        '1:0',
      ).state;
      const second = resolveMove(
        first,
        'p0',
        'p0:1',
        0,
        undefined,
        '1:1',
      ).state;
      expect(second.pieces[1].position.kind).toBe('HOME');
    });
    it('forfeits a later exact finish when the first six has no legal move', () => {
      const s = target(mode, 3);
      s.pieces[3].position = { kind: 'HOME_LANE', index: 2 };
      s.pieces.slice(0, 3).forEach((p) => (p.hasUsedHalki = true));
      const rolled = chain(s, [6, 3]);
      expect(rolled.currentPlayerId).toBe('p1');
      expect(rolled.revenge!.previousTurn!.dice.map((d) => d.status)).toEqual([
        'unplayable',
        'ended',
      ]);
      expect(rolled.pieces[3].position).toEqual({
        kind: 'HOME_LANE',
        index: 2,
      });
    });
    it('keeps collecting unusable sixes and makes the non-six usable after a burn', () => {
      const s = target(mode, 3);
      s.pieces[3].position = { kind: 'HOME_LANE', index: 2 };
      s.pieces.slice(0, 3).forEach((p) => (p.hasUsedHalki = true));
      const rolled = chain(s, [6, 6, 6, 3]);
      expect(legalMoves(rolled, 'p0').map((m) => m.dieId)).toEqual(['1:3']);
      expect(
        resolveMove(rolled, 'p0', 'p0:3', 0, undefined, '1:3').state.pieces[3]
          .position.kind,
      ).toBe('HOME');
    });
    it('rejects partial movement at the Home door and permits exact arrival', () => {
      const s = ready(game(mode), 3);
      s.pieces[0].position = track(49, 49);
      expect(legalMoves(s, 'p0')).toEqual([]);
      ready(s, 1);
      const moved = resolveMove(s, 'p0', 'p0:0', 0).state;
      expect(moved.pieces[0].position).toEqual({
        kind: 'HOME_GATE_LOCKED',
        index: 50,
        travelled: 50,
      });
    });
    it('credits only the physical attacker and preserves another piece’s Home lock', () => {
      const s = ready(game(mode), 3);
      s.pieces[0].position = {
        kind: 'HOME_GATE_LOCKED',
        index: 50,
        travelled: 50,
      };
      s.pieces[1].position = track(3);
      s.pieces[4].position = track(6);
      const r = resolveMove(s, 'p0', 'p0:1', 0);
      expect(r.state.pieces[0].hasCaptured).toBe(false);
      expect(r.state.pieces[0].position.kind).toBe('HOME_GATE_LOCKED');
      expect(r.state.pieces[1].hasCaptured).toBe(true);
      expect(r.events.find((e) => e.type === 'HOME_UNLOCKED')!.pieceId).toBe(
        'p0:1',
      );
    });
    it.each([3, 4, 5, 6])(
      'uses the full %i near Finish, never truncates movement',
      (die) => {
        const s = ready(game(mode), die);
        s.pieces[0].position = { kind: 'HOME_LANE', index: 2 };
        s.pieces[0].hasCaptured = true;
        expect(legalMoves(s, 'p0').some((m) => m.pieceId === 'p0:0')).toBe(
          die === 3,
        );
      },
    );
    it('declines an optional pair without spending or moving anything', () => {
      const s = chain(target(mode), [6, 6, 4]);
      const before = structuredClone(s);
      const next = declineHalki(s, 'p0', 0).state;
      expect(next.pieces).toEqual(before.pieces);
      expect(next.revenge!.turnDice).toEqual(before.revenge!.turnDice);
      expect(next.revenge!.halkiChoice).toBeNull();
    });
    it('uses only 6B and 4 for Halki, preserving 6A and the invaded Home', () => {
      const s = chain(target(mode), [6, 6, 4]);
      const next = resolveMove(s, 'p0', 'p0:0', 0, 'p1', '1:2').state;
      expect(next.revenge!.turnDice.map((d) => d.status)).toEqual([
        'available',
        'halki',
        'halki',
      ]);
      expect(next.pieces[0].halkiInvadedHomeOwnerId).toBe('p1');
      expect(legalMoves(next, 'p0').every((m) => m.dieId === '1:0')).toBe(true);
      expect(migrateRevenge(JSON.parse(JSON.stringify(next)))).toBe(false);
    });
    it('does not force a birth when the sole unfinished piece is already Halki', () => {
      const s = target(mode, 3);
      s.pieces[3].position = {
        kind: 'HALKI_TRACK',
        index: 9,
        travelled: 2,
        homeSeat: 1,
      };
      s.pieces[3].hasUsedHalki = true;
      const rolled = chain(s, [6, 4]);
      expect(rolled.revenge!.halkiChoice?.required).toBe(false);
      expect(() => declineHalki(rolled, 'p0', 0)).not.toThrow();
    });
    it('a burned six cannot activate even with three finished pieces and a real victim', () => {
      const rolled = chain(target(mode, 3), [6, 6, 6, 4]);
      expect(rolled.revenge!.halkiChoice).toBeNull();
      expect(
        legalMoves(rolled, 'p0').every((m) => m.action !== 'activate'),
      ).toBe(true);
    });
  },
);
describe('Solo has no team state', () => {
  it.each([2, 3, 4])(
    'supports %i individual players and awards a personal finish',
    (count) => {
      const s = ready(game('REVENGE_SOLO', count), 1);
      expect(s.players.every((p) => p.team === null)).toBe(true);
      expect(teammates(s, 'p0', 'p1')).toBe(false);
      for (let i = 0; i < 3; i++) s.pieces[i].position = { kind: 'HOME' };
      s.pieces[3].position = { kind: 'HOME_LANE', index: 4 };
      s.pieces[3].hasCaptured = true;
      const result = resolveMove(s, 'p0', 'p0:3', 0).state;
      expect(result.phase).toBe('FINISHED');
      expect(result.winner).toBe('p0');
      expect(result.winnerTeam).toBeNull();
      expect(result.revenge!.support).toEqual({});
    },
  );
  it('does not end a three-player match when only one player leaves', () => {
    const next = resolveForfeit(game('REVENGE_SOLO', 3), 'p0', 0).state;
    expect(next.phase).toBe('PLAYING');
    expect(next.currentPlayerId).toBe('p1');
    const end = resolveForfeit(next, 'p1', 0).state;
    expect(end.winner).toBe('p2');
    expect(end.winnerTeam).toBeNull();
  });
  it('opposite seats can attack each other and never create a shield', () => {
    const s = game('REVENGE_SOLO');
    s.pieces[0].position = {
      kind: 'HALKI_TRACK',
      homeSeat: 1,
      index: 6,
      travelled: 2,
    };
    s.pieces[4].position = track(6);
    s.pieces[8].position = track(6);
    expect(shieldTeams(s, [s.pieces[4], s.pieces[8]])).toEqual([]);
    expect(canCapture(s, s.pieces[0], [s.pieces[4], s.pieces[8]])).toBe(true);
    syncSquares(s);
    expect(s.revenge!.shields).toEqual([]);
  });
});
describe.each(['KNOCKOUT', 'KNOCKOUT_2V2'] as Mode[])(
  '%s missed captures',
  (mode) => {
    function scenario() {
      const s = ready(game(mode), 3);
      s.pieces[0].position = track(3);
      s.pieces[1].position = track(7);
      s.pieces[2].position = track(14);
      s.pieces[4].position = track(6);
      s.pieces[5].position = track(10);
      return s;
    }
    it('punishes every capture-capable piece while the chosen non-capturing piece stays', () => {
      const s = scenario();
      const next = resolveMove(s, 'p0', 'p0:2', 0);
      expect(next.state.pieces.slice(0, 2).map((p) => p.position.kind)).toEqual(
        ['BASE', 'BASE'],
      );
      expect(next.state.pieces[2].position).toMatchObject({ index: 17 });
      expect(
        next.events
          .filter((e) => e.type === 'MISSED_CAPTURE')
          .map((e) => e.pieceId),
      ).toEqual(['p0:0', 'p0:1']);
      next.state.currentPlayerId = 'p0';
      expect(
        legalMoves(next.state, 'p0', 5).some((m) => m.pieceId === 'p0:0'),
      ).toBe(false);
      expect(
        legalMoves(next.state, 'p0', 6).some((m) => m.pieceId === 'p0:0'),
      ).toBe(true);
      expect(s.pieces[0].position.kind).toBe('TRACK');
    });
    it('one successful capture does not excuse another piece’s missed capture', () => {
      const next = resolveMove(scenario(), 'p0', 'p0:0', 0).state;
      expect(next.pieces[0].position).toMatchObject({ index: 6 });
      expect(next.pieces[1].position.kind).toBe('BASE');
      expect(next.pieces[4].position.kind).toBe('BASE');
    });
    it.each(['safe', 'wrong die', 'unreachable'] as const)(
      '%s target never creates a punishment',
      (kind) => {
        const s = scenario();
        s.pieces[5].position = { kind: 'BASE' };
        if (kind === 'safe') {
          s.pieces[0].position = track(5);
          s.pieces[4].position = track(8);
        }
        if (kind === 'wrong die') s.dice = 2;
        if (kind === 'unreachable') s.pieces[0].position = { kind: 'BASE' };
        const next = resolveMove(s, 'p0', 'p0:2', 0);
        expect(next.events.some((e) => e.type === 'MISSED_CAPTURE')).toBe(
          false,
        );
      },
    );
  },
);
it('2v2 shields different allied owners and excludes them from missed-capture opportunities', () => {
  const s = ready(game('KNOCKOUT_2V2'), 3);
  s.pieces[0].position = track(3);
  s.pieces[1].position = track(14);
  s.pieces[4].position = track(6);
  s.pieces[12].position = track(6);
  expect(
    legalMoves(s, 'p0').find((m) => m.pieceId === 'p0:0')!.knockIds,
  ).toEqual([]);
  const next = resolveMove(s, 'p0', 'p0:1', 0);
  expect(next.events.some((e) => e.type === 'MISSED_CAPTURE')).toBe(false);
  expect(next.state.pieces[0].position.kind).toBe('TRACK');
  s.pieces[12].position = { kind: 'BASE' };
  s.pieces[5].position = track(6);
  expect(
    legalMoves(s, 'p0').find((m) => m.pieceId === 'p0:0')!.knockIds,
  ).toEqual(['p1:0', 'p1:1']);
});
it('Halki respects a real Team shield but captures two same-owner defenders', () => {
  const s = game();
  s.pieces[0].position = {
    kind: 'HALKI_TRACK',
    homeSeat: 1,
    index: 6,
    travelled: 5,
  };
  s.pieces[4].position = track(6);
  s.pieces[12].position = track(6);
  expect(canCapture(s, s.pieces[0], [s.pieces[4], s.pieces[12]])).toBe(false);
  s.pieces[5].position = track(6);
  expect(canCapture(s, s.pieces[0], [s.pieces[4], s.pieces[5]])).toBe(true);
});
it('unknown old per-piece capture credit pauses an old save instead of unlocking every token', () => {
  const s = game();
  Reflect.set(s.revenge!, 'version', 2);
  s.players[0].knocked = 1;
  s.players[0].homeUnlocked = true;
  for (const p of s.pieces) Reflect.deleteProperty(p, 'hasCaptured');
  migrateRevenge(s);
  expect(s.revenge!.rulePending).toContain('per-piece capture');
  expect(s.pieces.slice(0, 4).every((p) => !p.hasCaptured)).toBe(true);
});

it('an old in-progress dice pool cannot bypass the new burn/order rules after restart', () => {
  const initial = game();
  initial.pieces[0].position = track(1, 1);
  const s = chain(initial, [6, 6, 6, 4]);
  Reflect.set(s.revenge!, 'version', 2);
  migrateRevenge(s);
  expect(s.revenge!.rulePending).toContain('previous dice rules');
  expect(legalMoves(s, 'p0')).toEqual([]);
});

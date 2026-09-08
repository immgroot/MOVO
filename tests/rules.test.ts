import { describe, it, expect } from 'vitest';
import {
  createMatch,
  legalMoves,
  resolveMove,
  resolveRoll,
  resolveTimeout,
  resolveForfeit,
} from '../shared/game';
import {
  TRACK,
  STARTS,
  SAFE_SPACES,
  nextPosition,
  HOME_GATES,
  type Position,
  type Seat,
} from '../shared/topology';
const members = [
  { id: 'groot', name: 'GROOT', seat: 0 as Seat },
  { id: 'kiv', name: 'KIV', seat: 2 as Seat },
];
function game() {
  return createMatch('test', members, 30, 1000);
}
function track(index: number, travelled = 10) {
  return { kind: 'TRACK' as const, index, travelled };
}
describe('topology', () => {
  it('has 52 unique adjacent cells, including every corner and wrap', () => {
    expect(new Set(TRACK.map((t) => `${t.x},${t.y}`)).size).toBe(52);
    for (const t of TRACK) {
      const n = TRACK[t.next];
      expect(Math.max(Math.abs(n.x - t.x), Math.abs(n.y - t.y))).toBe(1);
    }
  });
  it.each([0, 1, 2, 3] as Seat[])(
    'seat %i completes its route, stops at its exposed gate, then enters only after unlock',
    (seat) => {
      const s = createMatch('t', [
        { id: 'a', name: 'A', seat },
        { id: 'b', name: 'B', seat: ((seat + 2) % 4) as Seat },
      ]);
      s.currentPlayerId = 'a';
      expect(legalMoves(s, 'a', 6)[0].path[0]).toEqual(track(STARTS[seat], 0));
      let p: Position = track(STARTS[seat], 0);
      for (let i = 0; i < 50; i++) p = nextPosition(p, seat, false)!;
      expect(p).toEqual({
        kind: 'HOME_GATE_LOCKED',
        index: HOME_GATES[seat],
        travelled: 50,
      });
      expect(nextPosition(p, seat, false)).toBeNull();
      expect(SAFE_SPACES.has(HOME_GATES[seat])).toBe(false);
      expect(
        nextPosition(track((STARTS[seat] + 50) % 52, 50), seat, true),
      ).toEqual({ kind: 'HOME_LANE', index: 0 });
    },
  );
  it('defines eight safe spaces including every start', () => {
    expect(SAFE_SPACES.size).toBe(8);
    for (const s of STARTS) expect(SAFE_SPACES.has(s)).toBe(true);
  });
});
describe('rolls and turn sequences', () => {
  it.each([1, 2, 3, 4, 5])('roll %i cannot open a piece and advances', (n) => {
    const r = resolveRoll(game(), 'groot', n);
    expect(r.state.currentPlayerId).toBe('kiv');
    expect(r.events.at(-1)?.type).toBe('NO_MOVES');
  });
  it('six opens and valid action earns another roll', () => {
    let s = resolveRoll(game(), 'groot', 6).state;
    s = resolveMove(s, 'groot', 'groot:0').state;
    expect(s.pieces[0].position).toEqual(track(0, 0));
    expect(s.currentPlayerId).toBe('groot');
    expect(s.dice).toBeNull();
    expect(s.consecutiveSixes).toBe(1);
  });
  it('third consecutive six burns only the third move', () => {
    let s = game();
    for (let i = 0; i < 2; i++) {
      s = resolveRoll(s, 'groot', 6).state;
      s = resolveMove(s, 'groot', 'groot:0').state;
    }
    const before = structuredClone(s.pieces);
    const r = resolveRoll(s, 'groot', 6);
    expect(r.state.pieces).toEqual(before);
    expect(r.state.currentPlayerId).toBe('kiv');
    expect(r.state.consecutiveSixes).toBe(0);
    expect(r.events.at(-1)?.type).toBe('SIX_BURNED');
  });
  it('a non-six resets the streak', () => {
    let s = resolveRoll(game(), 'groot', 6).state;
    s = resolveMove(s, 'groot', 'groot:0').state;
    s = resolveRoll(s, 'groot', 2).state;
    expect(s.consecutiveSixes).toBe(0);
  });
  it('rejects illegal rolls, repeat rolls and wrong turns', () => {
    expect(() => resolveRoll(game(), 'kiv', 6)).toThrow();
    expect(() => resolveRoll(game(), 'groot', 7)).toThrow();
    expect(() =>
      resolveRoll(resolveRoll(game(), 'groot', 6).state, 'groot', 1),
    ).toThrow();
  });
  it('rejects a piece owned by another player', () => {
    expect(() =>
      resolveMove(resolveRoll(game(), 'groot', 6).state, 'groot', 'kiv:0'),
    ).toThrow();
  });
});
describe('knockout, home and shared occupancy', () => {
  it('knocks exactly, returns target to base and permanently unlocks all pieces', () => {
    const s = game();
    s.pieces[0].position = track(1);
    s.pieces[4].position = track(4);
    s.dice = 3;
    const r = resolveMove(s, 'groot', 'groot:0');
    expect(r.state.pieces[4].position.kind).toBe('BASE');
    expect(r.state.players[0].knocked).toBe(1);
    expect(r.state.players[0].homeUnlocked).toBe(true);
    expect(r.events.map((e) => e.type)).toContain('HOME_UNLOCKED');
  });
  it('passing an enemy does not knock it', () => {
    const s = game();
    s.pieces[0].position = track(1);
    s.pieces[4].position = track(2);
    s.dice = 3;
    expect(resolveMove(s, 'groot', 'groot:0').state.players[0].knocked).toBe(0);
  });
  it('safe spaces protect every occupant', () => {
    const s = game();
    s.pieces[0].position = track(6);
    s.pieces[4].position = track(8);
    s.pieces[5].position = track(8);
    s.dice = 2;
    const r = resolveMove(s, 'groot', 'groot:0');
    expect(r.state.pieces[4].position.kind).toBe('TRACK');
    expect(r.state.players[0].homeUnlocked).toBe(false);
  });
  it('locked arrival stops at the gate and discards unused pips', () => {
    const s = game();
    s.pieces[0].position = track(49, 49);
    s.dice = 5;
    const r = resolveMove(s, 'groot', 'groot:0');
    expect(r.state.pieces[0].position).toEqual({
      kind: 'HOME_GATE_LOCKED',
      index: 50,
      travelled: 50,
    });
    expect(r.events[0].path).toHaveLength(1);
    expect(r.events.map((e) => e.type)).toContain('HOME_LOCKED');
  });
  it('unlock does not permit home entry at arbitrary positions', () => {
    const s = game();
    s.players[0].homeUnlocked = true;
    s.pieces[0].position = track(2, 54);
    s.dice = 2;
    expect(resolveMove(s, 'groot', 'groot:0').state.pieces[0].position).toEqual(
      track(4, 56),
    );
  });
  it('unlocked entry path turns at the correct space', () => {
    const s = game();
    s.players[0].homeUnlocked = true;
    s.pieces[0].position = track(49, 49);
    s.dice = 3;
    const r = resolveMove(s, 'groot', 'groot:0');
    expect(r.events[0].path).toEqual([
      track(50, 50),
      { kind: 'HOME_LANE', index: 0 },
      { kind: 'HOME_LANE', index: 1 },
    ]);
  });
  it('a knocked unlocked player keeps home unlocked', () => {
    const s = game();
    s.players[1].homeUnlocked = true;
    s.pieces[0].position = track(1);
    s.pieces[4].position = track(2);
    s.dice = 1;
    expect(
      resolveMove(s, 'groot', 'groot:0').state.players[1].homeUnlocked,
    ).toBe(true);
  });
  it.each([2, 3, 4])('roll %i may land on or pass an enemy stack', (roll) => {
    const s = game();
    s.pieces[0].position = track(1);
    s.pieces[4].position = track(3);
    s.pieces[5].position = track(3);
    expect(
      legalMoves(s, 'groot', roll).some((m) => m.pieceId === 'groot:0'),
    ).toBe(true);
    s.dice = roll;
    const r = resolveMove(s, 'groot', 'groot:0');
    expect(r.state.players[0].knocked).toBe(roll === 2 ? 2 : 0);
  });
  it('can approach an occupied square without capturing', () => {
    const s = game();
    s.pieces[0].position = track(1);
    s.pieces[4].position = track(3);
    s.pieces[5].position = track(3);
    expect(legalMoves(s, 'groot', 1).length).toBe(1);
  });
  it('allows a third friendly piece to land and permits passing', () => {
    const s = game();
    s.pieces[0].position = track(1);
    s.pieces[1].position = track(3);
    s.pieces[2].position = track(3);
    expect(legalMoves(s, 'groot', 3).some((m) => m.pieceId === 'groot:0')).toBe(
      true,
    );
    expect(legalMoves(s, 'groot', 2).some((m) => m.pieceId === 'groot:0')).toBe(
      true,
    );
  });
  it('friendly sharing emits only movement and each piece can move independently', () => {
    const s = game();
    s.pieces[0].position = track(1);
    s.pieces[1].position = track(3);
    s.dice = 2;
    const r = resolveMove(s, 'groot', 'groot:0');
    expect(r.events.map((e) => e.type)).toEqual(['PIECE_MOVED']);
    r.state.currentPlayerId = 'groot';
    r.state.dice = 1;
    expect(
      resolveMove(r.state, 'groot', 'groot:0').state.pieces[0].position,
    ).toEqual(track(4, 13));
  });
  it('home lanes permit friendly occupancy and do not interact with rivals', () => {
    const s = game();
    s.players[0].homeUnlocked = true;
    s.pieces[0].position = { kind: 'HOME_LANE', index: 0 };
    s.pieces[1].position = { kind: 'HOME_LANE', index: 1 };
    s.pieces[2].position = { kind: 'HOME_LANE', index: 1 };
    s.dice = 1;
    const result = resolveMove(s, 'groot', 'groot:0');
    expect(result.state.pieces[0].position).toEqual({
      kind: 'HOME_LANE',
      index: 1,
    });
    expect(result.state.players[0].knocked).toBe(0);
  });
  it('requires exact finish; overshoot is illegal', () => {
    const s = game();
    s.pieces[0].position = { kind: 'HOME_LANE', index: 2 };
    expect(legalMoves(s, 'groot', 4)).toHaveLength(0);
    expect(legalMoves(s, 'groot', 3)[0].path.at(-1)).toEqual({ kind: 'HOME' });
  });
  it('secures the fourth piece and declares server victory', () => {
    const s = game();
    s.players[0].homeUnlocked = true;
    for (let i = 0; i < 3; i++) s.pieces[i].position = { kind: 'HOME' };
    s.pieces[3].position = { kind: 'HOME_LANE', index: 4 };
    s.dice = 1;
    const r = resolveMove(s, 'groot', 'groot:3');
    expect(r.state.winner).toBe('groot');
    expect(r.state.phase).toBe('FINISHED');
    expect(r.events.map((e) => e.type)).toContain('PLAYER_WON');
    expect(() => resolveRoll(r.state, 'groot', 6)).toThrow();
  });
});
describe('timeouts and departure', () => {
  it('does not advance before deadline', () => {
    const s = game();
    expect(resolveTimeout(s, 30999).state).toBe(s);
  });
  it('expires pending move and resets six sequence', () => {
    const s = resolveRoll(game(), 'groot', 6, 1000).state;
    const r = resolveTimeout(s, 31000);
    expect(r.state.currentPlayerId).toBe('kiv');
    expect(r.state.dice).toBeNull();
    expect(r.state.consecutiveSixes).toBe(0);
  });
  it('off timer never expires', () => {
    const s = createMatch('x', members, 0);
    expect(resolveTimeout(s, Number.MAX_SAFE_INTEGER).state).toBe(s);
  });
  it('last remaining player wins by forfeit', () => {
    const r = resolveForfeit(game(), 'groot');
    expect(r.state.winner).toBe('kiv');
    expect(r.state.winReason).toBe('FORFEIT');
  });
  it('forfeit does not skip the next active seat', () => {
    const s = createMatch('x', [
      ...members,
      { id: 'nida', name: 'NIDA', seat: 1 },
    ]);
    const r = resolveForfeit(s, 'groot');
    expect(r.state.currentPlayerId).toBe('nida');
    expect(r.state.phase).toBe('PLAYING');
  });
});

import { describe, it, expect } from 'vitest';
import {
  createMatch,
  resolveRoll,
  resolveMove,
  legalMoves,
  homeCount,
  type Match,
} from '../shared/game';
import {
  canCapture,
  isHalki,
  shieldTeams,
  syncSquares,
} from '../shared/revenge-collision';
import { migrateRevenge } from '../shared/revenge-migration';
import {
  HOME_GATES,
  positionKey,
  type Seat,
  type Position,
} from '../shared/topology';
const members = ['GROOT', 'KIV', 'NIDA', 'NOOR'].map((name, seat) => ({
  name,
  id: `p${seat}`,
  seat: seat as Seat,
}));
const game = () => createMatch('corrections', members, 0, 0, 'REVENGE');
const track = (index: number, travelled = 10): Position => ({
  kind: 'TRACK',
  index,
  travelled,
});
const halki = (index: number, homeSeat: Seat = 1, travelled = 5): Position => ({
  kind: 'HALKI_TRACK',
  homeSeat,
  index,
  travelled,
});
function take(s: Match, seat: number, die: number, piece: number) {
  s = structuredClone(s);
  s.currentPlayerId = `p${seat}`;
  s.revenge!.beneficiaryId = `p${seat}`;
  s.dice = null;
  s.consecutiveSixes = 0;
  Object.assign(s.revenge!, {
    turnDice: [],
    rollPending: true,
    declinedPairs: [],
    halkiChoice: null,
    awaitingBonus: false,
    activationValue: null,
    queuedRolls: [],
    diceHistory: [],
  });
  let rolled = resolveRoll(s, `p${seat}`, die, 0).state;
  if (die === 6 && rolled.revenge!.rollPending)
    rolled = resolveRoll(rolled, `p${seat}`, 1, 0).state;
  return resolveMove(rolled, `p${seat}`, `p${seat}:${piece}`, 0);
}
function birth(target: Seat = 1) {
  const s = game();
  s.players[0].homeUnlocked = true;
  s.players[0].knocked = 1;
  s.pieces[0].position = { kind: 'HOME' };
  s.pieces[target * 4].position = { kind: 'HOME_LANE', index: 1 };
  const rolled = resolveRoll(resolveRoll(s, 'p0', 6, 0).state, 'p0', 4, 0);
  return resolveMove(rolled.state, 'p0', 'p0:0', 0, `p${target}`).state;
}
describe('corrected ownership and shield composition', () => {
  it.each([1, 2, 3, 4])(
    'normal captures all %i same-player normals',
    (count) => {
      const s = game();
      s.pieces[0].position = track(3);
      for (let i = 0; i < count; i++) s.pieces[4 + i].position = track(6);
      const r = take(s, 0, 3, 0);
      expect(r.events.filter((e) => e.type === 'PIECE_KNOCKED')).toHaveLength(
        count,
      );
      expect(r.state.players[0].homeUnlocked).toBe(true);
    },
  );
  it.each(['normal', 'halki'] as const)(
    '%s cannot kill a normal + teammate Halki shield',
    (kind) => {
      const s = game();
      s.pieces[0].position = kind === 'normal' ? track(3) : halki(9);
      s.pieces[4].position = track(6);
      s.pieces[12].position = halki(6, 0);
      syncSquares(s);
      expect(shieldTeams(s, [s.pieces[4], s.pieces[12]])).toEqual(['B']);
      const r = take(s, 0, 3, 0);
      expect(r.events.some((e) => e.type === 'PIECE_KNOCKED')).toBe(false);
      expect(r.state.revenge!.contests).toHaveLength(1);
    },
  );
  it('teammate Halki + Halki also supplies both owners and protects against Halki', () => {
    const s = game();
    s.pieces[0].position = halki(9);
    s.pieces[4].position = halki(6, 0);
    s.pieces[12].position = halki(6, 2);
    expect(
      take(s, 0, 3, 0).events.some((e) => e.type === 'PIECE_KNOCKED'),
    ).toBe(false);
  });
  it('same-player normal + Halki is not a shield and Halki can capture both', () => {
    const s = game();
    s.pieces[0].position = halki(9);
    s.pieces[4].position = track(6);
    s.pieces[5].position = halki(6, 0);
    expect(shieldTeams(s, [s.pieces[4], s.pieces[5]])).toEqual([]);
    expect(
      take(s, 0, 3, 0).events.filter((e) => e.type === 'PIECE_KNOCKED'),
    ).toHaveLength(2);
  });
  it('normal+normal mixed shield still loses to a two-piece Halki attack', () => {
    const s = game();
    s.pieces[0].position = halki(9);
    s.pieces[4].position = track(6);
    s.pieces[12].position = track(6);
    expect(
      take(s, 0, 3, 0).events.filter((e) => e.type === 'PIECE_KNOCKED'),
    ).toHaveLength(2);
  });
  it('three-to-two does not capture a remaining protected normal/Halki pair', () => {
    const s = game();
    s.pieces[0].position = halki(6);
    s.pieces[4].position = track(6);
    s.pieces[5].position = track(6);
    s.pieces[12].position = halki(6, 0);
    syncSquares(s);
    const r = take(s, 1, 1, 1);
    expect(r.state.pieces[4].position.kind).toBe('TRACK');
    expect(isHalki(r.state.pieces[12])).toBe(true);
    expect(r.events.some((e) => e.type === 'PIECE_KNOCKED')).toBe(false);
  });
  it('departure of a teammate Halki breaks its shield and the waiting rival captures the survivor', () => {
    const s = game();
    s.pieces[0].position = halki(6);
    s.pieces[4].position = track(6);
    s.pieces[12].position = halki(6, 0);
    syncSquares(s);
    expect(take(s, 3, 1, 0).state.pieces[4].position.kind).toBe('BASE');
  });
  it('a protected Home target cannot create a no-kill Halki activation', () => {
    const s = game();
    s.pieces[0].position = { kind: 'HOME' };
    s.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
    s.pieces[12].position = {
      kind: 'HALKI_HOME_INVASION',
      homeSeat: 1,
      index: 1,
    };
    const r = resolveRoll(resolveRoll(s, 'p0', 6, 0).state, 'p0', 4, 0);
    expect(r.state.revenge!.activationValue).toBeNull();
    expect(r.state.pieces[0].hasUsedHalki).toBe(false);
  });
  it('the special mixed shield remains protected on a Safe square', () => {
    const s = game();
    s.pieces[0].position = halki(8);
    s.pieces[4].position = track(8);
    s.pieces[12].position = halki(8, 0);
    expect(canCapture(s, s.pieces[0], [s.pieces[4], s.pieces[12]])).toBe(false);
  });
});
describe('corrected Home gate', () => {
  it('locks once, cannot start another lap, and another piece unlocks without teleporting', () => {
    const s = game();
    s.pieces[0].position = track(49, 49);
    s.pieces[1].position = track(3);
    s.pieces[4].position = track(6);
    const wait = take(s, 0, 3, 0);
    expect(wait.state.pieces[0].position).toEqual({
      kind: 'HOME_GATE_LOCKED',
      index: 50,
      travelled: 50,
    });
    expect(wait.events.some((e) => e.type === 'HOME_LOCKED')).toBe(true);
    const at = positionKey(wait.state.pieces[0].position, 0, 0);
    for (let die = 1; die <= 6; die++) {
      const v = {
        ...wait.state,
        currentPlayerId: 'p0',
        revenge: { ...wait.state.revenge!, beneficiaryId: 'p0' },
      };
      expect(legalMoves(v, 'p0', die).some((m) => m.pieceId === 'p0:0')).toBe(
        false,
      );
    }
    const unlocked = take(wait.state, 0, 3, 1);
    expect(unlocked.state.players[0].homeUnlocked).toBe(true);
    expect(
      unlocked.events.filter((e) => e.type === 'HOME_UNLOCKED'),
    ).toHaveLength(1);
    expect(positionKey(unlocked.state.pieces[0].position, 0, 0)).toBe(at);
    expect(take(unlocked.state, 0, 1, 0).state.pieces[0].position).toEqual({
      kind: 'HOME_LANE',
      index: 0,
    });
  });
  it('an already-unlocked player enters Home using the remaining pips', () => {
    const s = game();
    s.players[0].knocked = 1;
    s.players[0].homeUnlocked = true;
    s.pieces[0].position = track(49, 49);
    expect(take(s, 0, 3, 0).state.pieces[0].position).toEqual({
      kind: 'HOME_LANE',
      index: 1,
    });
  });
  it('a Home Door remains knockable and supports teammate shielding', () => {
    const s = game();
    s.pieces[0].position = {
      kind: 'HOME_GATE_LOCKED',
      index: 50,
      travelled: 50,
    };
    s.pieces[8].position = track(50);
    s.pieces[4].position = track(47);
    syncSquares(s);
    expect(s.revenge!.shields[0].index).toBe(50);
    expect(take(s, 1, 3, 0).state.pieces[0].position.kind).toBe(
      'HOME_GATE_LOCKED',
    );
    s.pieces[8].position = { kind: 'BASE' };
    expect(take(s, 1, 3, 0).state.pieces[0].position.kind).toBe('BASE');
  });
});
describe('one Halki life and the original invaded Home', () => {
  it('birth records the physical piece lifetime and target owner', () => {
    const s = birth();
    expect(s.pieces[0].hasUsedHalki).toBe(true);
    expect(s.pieces[0].halkiInvadedHomeOwnerId).toBe('p1');
    expect(s.pieces[1].hasUsedHalki).toBe(false);
    expect(homeCount(s, 'p0')).toBe(0);
  });
  it.each([1, 3] as Seat[])(
    'completes exactly 52 reverse track steps and re-enters original seat %i',
    (target) => {
      let s = birth(target);
      let trackSteps = 0,
        entered = false;
      for (let n = 0; n < 60; n++) {
        const before = s.pieces[0].position;
        const r = take(s, 0, 1, 0);
        s = r.state;
        const after = s.pieces[0].position;
        if (before.kind === 'HALKI_TRACK' && after.kind === 'HALKI_TRACK')
          trackSteps++;
        if (
          before.kind === 'HALKI_TRACK' &&
          after.kind === 'HALKI_HOME_RETURN'
        ) {
          entered = true;
          expect(before.index).toBe(HOME_GATES[target]);
          expect(before.travelled).toBe(52);
          expect(after.homeSeat).toBe(target);
        }
      }
      expect(trackSteps).toBe(52);
      expect(entered).toBe(true);
      expect(s.pieces[0].position).toEqual({ kind: 'HOME', homeSeat: target });
      s.pieces[target * 4].position = { kind: 'HOME_LANE', index: 1 };
      s.pieces[1].position = { kind: 'HOME' };
      s.currentPlayerId = 'p0';
      s.revenge!.beneficiaryId = 'p0';
      const rolls = resolveRoll(resolveRoll(s, 'p0', 6, 0).state, 'p0', 4, 0);
      expect(
        legalMoves(rolls.state, 'p0')
          .filter((m) => m.action === 'activate')
          .map((m) => m.pieceId),
      ).toEqual(['p0:1']);
      expect(() =>
        resolveMove(rolls.state, 'p0', 'p0:0', 0, `p${target}`),
      ).toThrow();
    },
  );
  it('two Halki pieces keep different invaded Home identities', () => {
    let s = birth(1);
    s.pieces[1].position = { kind: 'HOME' };
    s.pieces[12].position = { kind: 'HOME_LANE', index: 1 };
    s.currentPlayerId = 'p0';
    s.revenge!.beneficiaryId = 'p0';
    const rolls = resolveRoll(resolveRoll(s, 'p0', 6, 0).state, 'p0', 4, 0);
    s = resolveMove(rolls.state, 'p0', 'p0:1', 0, 'p3').state;
    expect(s.pieces.slice(0, 2).map((p) => p.halkiInvadedHomeOwnerId)).toEqual([
      'p1',
      'p3',
    ]);
    for (const piece of s.pieces.slice(0, 2)) {
      const homeSeat = piece.number === 0 ? 1 : 3;
      piece.position = halki(HOME_GATES[homeSeat], homeSeat, 52);
    }
    expect(take(s, 0, 1, 0).state.pieces[0].position).toEqual({
      kind: 'HALKI_HOME_RETURN',
      homeSeat: 1,
      index: 0,
    });
    expect(take(s, 0, 1, 1).state.pieces[1].position).toEqual({
      kind: 'HALKI_HOME_RETURN',
      homeSeat: 3,
      index: 0,
    });
  });
  it('does not re-enter the invaded Home before the full outer lap', () => {
    const s = birth();
    s.pieces[0].position = halki(11, 1, 0);
    expect(take(s, 0, 1, 0).state.pieces[0].position).toEqual(halki(10, 1, 1));
  });
  it('a returning Halki can kill in the invaded enemy lane', () => {
    const s = birth();
    s.pieces[0].position = halki(11, 1, 52);
    s.pieces[4].position = { kind: 'HOME_LANE', index: 0 };
    const r = take(s, 0, 1, 0);
    expect(r.state.pieces[4].position.kind).toBe('BASE');
  });
});
describe('safe migration of earlier Revenge saves', () => {
  it('restores an original Home from reverse track position and distance', () => {
    const s = birth();
    s.pieces[0].position = halki(9, 1, 2);
    Reflect.deleteProperty(s.pieces[0].position, 'homeSeat');
    Reflect.deleteProperty(s.pieces[0], 'halkiInvadedHomeOwnerId');
    Reflect.deleteProperty(s.pieces[0], 'hasUsedHalki');
    expect(migrateRevenge(s)).toBe(true);
    expect(s.pieces[0].halkiInvadedHomeOwnerId).toBe('p1');
    expect(s.pieces[0].hasUsedHalki).toBe(true);
    expect(s.pieces[0].position).toEqual(halki(9, 1, 2));
    expect(migrateRevenge(s)).toBe(false);
  });
  it('unknown old lifetime history never grants a fresh Halki life', () => {
    const s = game();
    Reflect.set(s.revenge!, 'version', 1);
    for (const p of s.pieces) Reflect.deleteProperty(p, 'hasUsedHalki');
    s.players[0].homeUnlocked = true;
    migrateRevenge(s);
    expect(s.pieces.every((p) => p.hasUsedHalki)).toBe(true);
    expect(s.players[0].homeUnlocked).toBe(false);
  });
  it('an unrecoverable legacy return lane pauses movement without crashing', () => {
    const s = game();
    s.pieces[0].position = { kind: 'HALKI_HOME_RETURN', homeSeat: 0, index: 2 };
    Reflect.deleteProperty(s.pieces[0].position, 'homeSeat');
    migrateRevenge(s);
    expect(s.revenge!.rulePending).toMatch(/older match/);
    expect(legalMoves(s, 'p0', 1)).toEqual([]);
  });
  it('never migrates KNOCKOUT', () => {
    const s = createMatch('ko', members, 0, 0, 'KNOCKOUT_2V2'),
      copy = structuredClone(s);
    expect(migrateRevenge(s)).toBe(false);
    expect(s).toEqual(copy);
  });
});

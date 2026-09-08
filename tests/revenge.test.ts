import { describe, it, expect } from 'vitest';
import {
  createMatch,
  legalMoves,
  resolveRoll,
  resolveMove,
  resolveTimeout,
  homeCount,
  type Match,
  type Mode,
} from '../shared/game';
import { syncSquares, shieldTeams, isHalki } from '../shared/revenge-collision';
import { reverseHomeIndex } from '../shared/revenge';
import {
  HOME_GATES,
  STARTS,
  coordinates,
  type Position,
  type Seat,
} from '../shared/topology';
const members = ['GROOT', 'KIV', 'NIDA', 'NOOR'].map((name, seat) => ({
  id: `p${seat}`,
  name,
  seat: seat as Seat,
}));
const game = () => createMatch('test', members, 0, 0, 'REVENGE');
// Existing cases are retained; expectations below follow the September correction pass.
const track = (index: number): Position => ({
  kind: 'TRACK',
  index,
  travelled: 10,
});
const h = (index: number): Position => ({
  kind: 'HALKI_TRACK',
  homeSeat: 1,
  index,
  travelled: 5,
});
function turn(
  s: Match,
  seat: number,
  die: number,
  piece: number,
  target?: number,
) {
  const setup = structuredClone(s);
  // An active-Halki fixture represents a prior successful birth and Home unlock.
  for (const p of setup.pieces)
    if (isHalki(p)) {
      p.hasUsedHalki = true;
      const owner = setup.players.find((o) => o.id === p.ownerId)!;
      owner.homeUnlocked = true;
      owner.knocked = Math.max(1, owner.knocked);
    }
  setup.currentPlayerId = `p${seat}`;
  setup.revenge!.beneficiaryId = `p${seat}`;
  setup.dice = null;
  setup.revenge!.awaitingBonus = false;
  setup.revenge!.queuedRolls = [];
  setup.revenge!.activationValue = null;
  Object.assign(setup.revenge!, {
    turnDice: [],
    rollPending: true,
    declinedPairs: [],
    halkiChoice: null,
  });
  setup.consecutiveSixes = 0;
  let r = resolveRoll(setup, `p${seat}`, die, 0);
  if (die === 6 && r.state.revenge!.rollPending)
    r = resolveRoll(r.state, `p${seat}`, 1, 0);
  return resolveMove(
    r.state,
    `p${seat}`,
    `p${seat}:${piece}`,
    0,
    target === undefined ? undefined : `p${target}`,
  );
}
function activation(home = 1, bonus = 4) {
  const s = game();
  s.pieces[0].position = { kind: 'HOME' };
  s.pieces[1].position = track(4);
  s.pieces[4].position = { kind: 'HOME_LANE', index: home };
  const a = resolveRoll(s, 'p0', 6, 0),
    b = resolveRoll(a.state, 'p0', bonus, 0);
  return { initial: s, first: a, second: b };
}
describe('Revenge registration and normal route', () => {
  it.each([2, 3])('rejects %i seats', (n) =>
    expect(() =>
      createMatch('x', members.slice(0, n), 0, 0, 'REVENGE'),
    ).toThrow(/four/),
  );
  it('uses opposite teams with individual colors and four stable pieces each', () => {
    const s = game();
    expect(s.players.map((p) => p.team)).toEqual(['A', 'B', 'A', 'B']);
    expect(new Set(s.pieces.map((p) => p.id)).size).toBe(16);
    expect(s.players.every((p) => !p.homeUnlocked && p.knocked === 0)).toBe(
      true,
    );
  });
  it.each([0, 1, 2, 3] as Seat[])(
    'seat %i stops at its Home Door without a knock',
    (seat) => {
      const s = game();
      s.pieces[seat * 4].position = {
        kind: 'TRACK',
        index: (HOME_GATES[seat] + 51) % 52,
        travelled: 49,
      };
      const r = turn(s, seat, 3, 0);
      expect(r.state.pieces[seat * 4].position).toEqual({
        kind: 'HOME_GATE_LOCKED',
        index: HOME_GATES[seat],
        travelled: 50,
      });
      expect(r.state.players[seat].knocked).toBe(0);
    },
  );
  it.each(['KNOCKOUT', 'KNOCKOUT_2V2'] as Mode[])(
    '%s retains gate locks and has no Revenge state',
    (mode) => {
      const s = createMatch('ko', members, 0, 0, mode);
      s.pieces[0].position = { kind: 'TRACK', index: 49, travelled: 49 };
      const r = resolveMove(resolveRoll(s, 'p0', 3).state, 'p0', 'p0:0');
      expect(r.state.pieces[0].position.kind).toBe('HOME_GATE_LOCKED');
      expect(r.state.revenge).toBeUndefined();
    },
  );
});
describe('Team Shield and automatic contests', () => {
  it('same-player normal stack has no protection and both are captured', () => {
    const s = game();
    s.pieces[0].position = track(6);
    s.pieces[1].position = track(6);
    s.pieces[4].position = track(3);
    expect(shieldTeams(s, [s.pieces[0], s.pieces[1]])).toEqual([]);
    const r = turn(s, 1, 3, 0);
    expect(r.state.pieces.slice(0, 2).map((p) => p.position.kind)).toEqual([
      'BASE',
      'BASE',
    ]);
    expect(r.events.filter((e) => e.type === 'PIECE_KNOCKED')).toHaveLength(2);
    expect(r.state.revenge!.contests).toEqual([]);
  });
  it.each([1, 2, 3])(
    'normal attacker captures a single-owner non-shield stack of %i',
    (count) => {
      const s = game();
      s.pieces[0].position = track(3);
      for (let i = 0; i < count; i++)
        s.pieces[4 + i].position = i === 0 ? h(6) : track(6);
      const r = turn(s, 0, 3, 0);
      expect(
        r.state.pieces
          .slice(4, 4 + count)
          .filter((p) => p.position.kind === 'BASE'),
      ).toHaveLength(count);
    },
  );
  it('breaking a shield lets the waiting normal capture the remaining same-player stack', () => {
    const s = game();
    for (const i of [0, 4, 8, 9]) s.pieces[i].position = track(6);
    syncSquares(s);
    const r = turn(s, 0, 1, 0);
    expect(r.state.pieces[8].position.kind).toBe('BASE');
    expect(r.state.pieces[9].position.kind).toBe('BASE');
    expect(r.events.filter((e) => e.type === 'PIECE_KNOCKED')).toHaveLength(2);
    expect(r.state.revenge!.shields).toEqual([]);
  });
  it('Halki arrival kills the two teammates immediately, leaving no reinforcement contest', () => {
    const s = game();
    s.pieces[0].position = track(6);
    s.pieces[8].position = track(6);
    s.pieces[4].position = h(9);
    syncSquares(s);
    const r = turn(s, 1, 3, 0);
    expect(r.state.pieces[0].position.kind).toBe('BASE');
    expect(r.state.pieces[8].position.kind).toBe('BASE');
    expect(r.state.pieces[4].position).toMatchObject({
      kind: 'HALKI_TRACK',
      homeSeat: 1,
      index: 6,
    });
    expect(r.state.revenge!.contests).toEqual([]);
    expect(r.events.filter((e) => e.type === 'PIECE_KNOCKED')).toHaveLength(2);
    expect(
      r.events.some(
        (e) => e.type === 'CONTEST_CREATED' || e.type === 'REINFORCED',
      ),
    ).toBe(false);
  });
  it('Halki supplies its owner for a mixed teammate shield', () => {
    const s = game();
    s.pieces[0].position = track(6);
    s.pieces[8].position = h(6);
    expect(shieldTeams(s, [s.pieces[0], s.pieces[8]])).toEqual(['A']);
  });
  it('passes a shield without any collision', () => {
    const s = game();
    s.pieces[0].position = track(6);
    s.pieces[8].position = track(6);
    s.pieces[4].position = track(4);
    const r = turn(s, 1, 3, 0);
    expect(r.state.pieces[4].position).toMatchObject({ index: 7 });
    expect(r.events.some((e) => e.type === 'PIECE_KNOCKED')).toBe(false);
  });
  it('lands and persists a contested shield', () => {
    const s = game();
    s.pieces[0].position = track(6);
    s.pieces[8].position = track(6);
    s.pieces[4].position = track(3);
    const r = turn(s, 1, 3, 0);
    expect(r.state.revenge!.contests[0]).toMatchObject({
      index: 6,
      kind: 'SHIELD',
      pieceIds: ['p0:0', 'p1:0', 'p2:0'],
    });
    expect(r.state.pieces[0].position.kind).toBe('TRACK');
  });
  it.each([0, 2])(
    'seat %i leaves, waiting enemy kills the other teammate',
    (seat) => {
      const s = game();
      for (const i of [0, 4, 8]) s.pieces[i].position = track(6);
      syncSquares(s);
      const r = turn(s, seat, 1, 0);
      expect(r.state.pieces[seat === 0 ? 8 : 0].position.kind).toBe('BASE');
      expect(r.state.pieces[4].position.kind).toBe('TRACK');
      expect(r.events.map((e) => e.type).slice(0, 3)).toEqual([
        'PIECE_MOVED',
        'SHIELD_BROKEN',
        'PIECE_KNOCKED',
      ]);
      expect(r.state.revenge!.contests).toEqual([]);
    },
  );
  it.each([0, 2])('seat %i reinforces and kills waiting enemy', (seat) => {
    const s = game();
    for (const i of [0, 4, 8]) s.pieces[i].position = track(6);
    s.pieces[seat * 4 + 1].position = track(3);
    syncSquares(s);
    const r = turn(s, seat, 3, 1);
    expect(r.state.pieces[4].position.kind).toBe('BASE');
    expect(r.events.some((e) => e.type === 'REINFORCED')).toBe(true);
  });
  it('both mixed shields survive reinforcement and resolve one side breaking', () => {
    const s = game();
    for (const i of [0, 4, 8]) s.pieces[i].position = track(6);
    s.pieces[12].position = track(3);
    syncSquares(s);
    const r = turn(s, 3, 3, 0);
    expect(r.state.revenge!.contests[0].kind).toBe('DOUBLE_SHIELD');
    const left = turn(r.state, 0, 1, 0);
    expect(left.state.pieces[8].position.kind).toBe('BASE');
    expect(left.state.pieces[4].position.kind).toBe('TRACK');
    expect(left.state.pieces[12].position.kind).toBe('TRACK');
  });
  it('normal Safe protection prevents shield-break capture', () => {
    const s = game();
    for (const i of [0, 4, 8]) s.pieces[i].position = track(8);
    syncSquares(s);
    const r = turn(s, 0, 1, 0);
    expect(r.state.pieces[8].position.kind).toBe('TRACK');
  });
});
describe('kill-dependent Halki activation', () => {
  it.each([0, 1, 2, 3, 4])(
    'Home index %i uses exact reverse value',
    (index) => {
      const bonus = 5 - index;
      expect(reverseHomeIndex(bonus)).toBe(index);
      const { first, second } = activation(index, bonus);
      expect(first.state.pieces[0].position.kind).toBe('HOME');
      expect(first.state.revenge!.awaitingBonus).toBe(true);
      expect(legalMoves(first.state, 'p0')).toEqual([]);
      const r = resolveMove(second.state, 'p0', 'p0:0', 0, 'p1');
      expect(r.state.pieces[0].position).toEqual({
        kind: 'HALKI_HOME_INVASION',
        homeSeat: 1,
        index,
      });
      expect(r.state.pieces[4].position.kind).toBe('BASE');
      expect(homeCount(r.state, 'p0')).toBe(0);
      expect(
        r.events
          .find((e) => e.type === 'PIECE_MOVED')!
          .path?.every((p) => p.kind === 'HALKI_HOME_INVASION'),
      ).toBe(true);
      expect(new Set(r.state.pieces.map((p) => p.id)).size).toBe(16);
    },
  );
  it('6+4 against Home1 does not force Halki and keeps normal dice', () => {
    const { second } = activation(0, 4);
    expect(second.state.revenge!.activationValue).toBeNull();
    expect(second.state.dice).toBe(6);
    expect(legalMoves(second.state, 'p0').every((m) => !m.action)).toBe(true);
    const r = resolveMove(second.state, 'p0', 'p0:1', 0);
    expect(r.state.dice).toBe(4);
    expect(r.state.pieces[0].position.kind).toBe('HOME');
  });
  it('empty Home2 does not activate', () => {
    const s = game();
    s.pieces[0].position = { kind: 'HOME' };
    const six = resolveRoll(s, 'p0', 6);
    expect(six.state.revenge!.rollPending).toBe(true);
    const r = resolveRoll(six.state, 'p0', 4);
    expect(r.state.revenge!.turnDice.map((d) => d.value)).toEqual([6, 4]);
    expect(r.state.revenge!.activationValue).toBeNull();
    expect(r.state.pieces[0].position.kind).toBe('HOME');
  });
  it('three Home victims cannot be partially killed at birth', () => {
    const s = game();
    s.pieces[0].position = { kind: 'HOME' };
    for (const i of [4, 5, 6])
      s.pieces[i].position = { kind: 'HOME_LANE', index: 1 };
    const r = resolveRoll(resolveRoll(s, 'p0', 6).state, 'p0', 4);
    expect(r.state.revenge!.activationValue).toBeNull();
    expect(r.state.pieces[0].position.kind).toBe('HOME');
  });
  it('kills both normal Home victims on a valid activation', () => {
    const { initial } = activation();
    initial.pieces[5].position = { kind: 'HOME_LANE', index: 1 };
    const b = resolveRoll(resolveRoll(initial, 'p0', 6).state, 'p0', 4);
    const r = resolveMove(b.state, 'p0', 'p0:0', 0, 'p1');
    expect(r.state.pieces.slice(4, 6).map((p) => p.position.kind)).toEqual([
      'BASE',
      'BASE',
    ]);
  });
  it.each(['BASE', 'TRACK', 'HOME_LANE'] as const)(
    '%s cannot be selected for activation',
    (kind) => {
      const { second } = activation();
      second.state.pieces[1].position =
        kind === 'BASE'
          ? { kind }
          : kind === 'TRACK'
            ? track(4)
            : { kind, index: 2 };
      expect(() => resolveMove(second.state, 'p0', 'p0:1', 0, 'p1')).toThrow(
        /cannot use/,
      );
    },
  );
  it('requires server-approved target and rejects bypass', () => {
    const { initial } = activation();
    for (const i of [2, 3]) {
      initial.pieces[i].position = { kind: 'HOME' };
      initial.pieces[i].hasUsedHalki = true;
    }
    const second = resolveRoll(resolveRoll(initial, 'p0', 6).state, 'p0', 4);
    expect(() => resolveMove(second.state, 'p0', 'p0:1')).toThrow(
      /HALKI REQUIRED/,
    );
    expect(() => resolveMove(second.state, 'p0', 'p0:0', 0, 'p2')).toThrow();
    expect(() => resolveMove(second.state, 'p1', 'p0:0', 0, 'p1')).toThrow();
  });
  it('offers all eligible pieces and both valid enemy Homes', () => {
    const s = game();
    for (const i of [0, 1, 2]) s.pieces[i].position = { kind: 'HOME' };
    s.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
    s.pieces[12].position = { kind: 'HOME_LANE', index: 1 };
    const b = resolveRoll(resolveRoll(s, 'p0', 6).state, 'p0', 4);
    expect(legalMoves(b.state, 'p0')).toHaveLength(6);
    const r = resolveMove(b.state, 'p0', 'p0:2', 0, 'p3');
    expect(r.state.pieces[2].position).toMatchObject({ homeSeat: 3, index: 1 });
    expect(r.state.pieces[4].position.kind).toBe('HOME_LANE');
  });
  it('6+6 gives no Home6 and the next bonus preserves the chain', () => {
    const { second } = activation(1, 6);
    expect(reverseHomeIndex(6)).toBeNull();
    expect(second.state.revenge!.activationValue).toBeNull();
    expect(second.state.revenge!.rollPending).toBe(true);
    const b = resolveRoll(second.state, 'p0', 4);
    expect(b.state.revenge!.activationValue).toBe(4);
    expect(b.state.revenge!.halkiChoice?.dieIds).toEqual(['1:1', '1:2']);
  });
  it('third six stays in the pool, retaining both earlier six movements', () => {
    const { second } = activation(1, 6);
    const third = resolveRoll(second.state, 'p0', 6);
    expect(third.events.some((e) => e.type === 'SIX_BURNED')).toBe(false);
    const fourth = resolveRoll(third.state, 'p0', 4);
    expect(fourth.state.revenge!.activationValue).toBe(4);
    const firstMove = resolveMove(
      fourth.state,
      'p0',
      'p0:1',
      0,
      undefined,
      '1:0',
    );
    const end = resolveMove(firstMove.state, 'p0', 'p0:1', 0, undefined, '1:1');
    expect(end.state.pieces[1].position).toMatchObject({ index: 16 });
    expect(end.state.currentPlayerId).toBe('p0');
    expect(end.state.revenge!.turnDice.map((d) => d.status)).toEqual([
      'used',
      'used',
      'available',
      'available',
    ]);
  });
});
describe('active Halki combat, route and identity', () => {
  it.each([1, 2, 3])('Halki lands on %i normal defenders', (count) => {
    const s = game();
    s.pieces[0].position = h(9);
    for (let i = 0; i < count; i++) s.pieces[4 + i].position = track(6);
    const r = turn(s, 0, 3, 0);
    expect(
      r.state.pieces
        .slice(4, 4 + count)
        .filter((p) => p.position.kind === 'BASE'),
    ).toHaveLength(count <= 2 ? count : 0);
    if (count === 3) expect(r.state.revenge!.contests[0].kind).toBe('HALKI');
  });
  it('Halki breaks a two-color shield but never kills its own teammates', () => {
    const s = game();
    s.pieces[0].position = h(9);
    for (const i of [4, 12, 8]) s.pieces[i].position = track(6);
    const r = turn(s, 0, 3, 0);
    expect(r.state.pieces[4].position.kind).toBe('BASE');
    expect(r.state.pieces[12].position.kind).toBe('BASE');
    expect(r.state.pieces[8].position.kind).toBe('TRACK');
  });
  it('three-to-two automatic capture respects strength and emits both returns', () => {
    const s = game();
    s.pieces[0].position = h(6);
    for (const i of [4, 5, 12]) s.pieces[i].position = track(6);
    syncSquares(s);
    const r = turn(s, 1, 1, 1);
    expect(r.state.pieces[4].position.kind).toBe('BASE');
    expect(r.state.pieces[12].position.kind).toBe('BASE');
    expect(r.events.filter((e) => e.type === 'PIECE_KNOCKED')).toHaveLength(2);
  });
  it('later Halki kill is compulsory over normal movement', () => {
    const s = game();
    s.pieces[0].position = h(9);
    s.pieces[1].position = track(1);
    s.pieces[4].position = track(6);
    const r = resolveRoll(s, 'p0', 3);
    expect(legalMoves(r.state, 'p0').map((m) => m.pieceId)).toEqual(['p0:0']);
    expect(() => resolveMove(r.state, 'p0', 'p0:1')).toThrow(/HALKI REQUIRED/);
  });
  it('active Halki can make a non-killing reverse move', () => {
    const s = game();
    s.pieces[0].position = h(3);
    const r = turn(s, 0, 4, 0);
    expect(r.state.pieces[0].position).toMatchObject({
      kind: 'HALKI_TRACK',
      homeSeat: 1,
      index: 51,
    });
    expect(r.events[0].path?.map((p) => ('index' in p ? p.index : -1))).toEqual(
      [2, 1, 0, 51],
    );
  });
  it('Safe Spaces protect against normal attacks but not Halki', () => {
    const s = game();
    s.pieces[0].position = h(10);
    s.pieces[4].position = track(8);
    expect(turn(s, 0, 2, 0).state.pieces[4].position.kind).toBe('BASE');
    s.pieces[0].position = track(6);
    expect(turn(s, 0, 2, 0).state.pieces[4].position.kind).toBe('TRACK');
  });
  it('Home owner cannot kill invader even by returning Halki', () => {
    const s = game();
    s.pieces[0].position = {
      kind: 'HALKI_HOME_INVASION',
      homeSeat: 1,
      index: 1,
    };
    s.pieces[4].position = { kind: 'HOME_LANE', index: 0 };
    expect(turn(s, 1, 1, 0).state.pieces[0].position.kind).toBe(
      'HALKI_HOME_INVASION',
    );
    s.pieces[4].position = { kind: 'HALKI_HOME_RETURN', homeSeat: 1, index: 0 };
    expect(turn(s, 1, 1, 0).state.pieces[0].position.kind).toBe(
      'HALKI_HOME_INVASION',
    );
  });
  it('Halki kills a lone Halki and victim becomes normal Base', () => {
    const s = game();
    s.pieces[0].position = h(9);
    s.pieces[4].position = h(6);
    const r = turn(s, 0, 3, 0);
    expect(r.state.pieces[4].position).toEqual({ kind: 'BASE' });
    expect(r.events.some((e) => e.type === 'HALKI_DIED')).toBe(true);
  });
  it('normal attack kills white-track Halki, which reopens on six and moves forward', () => {
    const s = game();
    s.pieces[0].position = h(6);
    s.pieces[4].position = track(3);
    const killed = turn(s, 1, 3, 0);
    expect(killed.state.pieces[0].position.kind).toBe('BASE');
    const r = turn(killed.state, 0, 6, 0);
    expect(r.state.pieces[0].position).toEqual({
      kind: 'TRACK',
      index: 0,
      travelled: 0,
    });
    expect(turn(r.state, 0, 2, 0).state.pieces[0].position).toMatchObject({
      index: 2,
    });
    let journey = r.state;
    for (let i = 0; i < 56; i++) {
      expect(homeCount(journey, 'p0')).toBe(0);
      journey = turn(journey, 0, 1, 0).state;
    }
    expect(journey.pieces[0].position.kind).toBe('HOME');
    journey.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
    journey.currentPlayerId = 'p0';
    journey.revenge!.beneficiaryId = 'p0';
    const six = resolveRoll(journey, 'p0', 6, 0);
    expect(journey.pieces[0].hasUsedHalki).toBe(true);
    expect(six.state.revenge!.rollPending).toBe(true);
    expect(six.state.revenge!.halkiChoice).toBeNull();
    expect(legalMoves(six.state, 'p0').some((m) => m.pieceId === 'p0:0')).toBe(
      false,
    );
  });
  it.each(
    members.flatMap((p) =>
      members
        .filter((e) => e.seat % 2 !== p.seat % 2)
        .map((e) => [p.seat, e.seat] as const),
    ),
  )(
    'seat %i completes a full reverse lap back through invaded Home %i',
    (seat, enemy) => {
      let s = game();
      s.pieces[seat * 4].position = {
        kind: 'HALKI_HOME_INVASION',
        homeSeat: enemy,
        index: 4,
      };
      let steps = 0,
        sawReturn = false,
        sawStartFinish = false;
      while (s.pieces[seat * 4].position.kind !== 'HOME' && steps++ < 70) {
        const before = s.pieces[seat * 4].position,
          at = coordinates(before, seat, 0);
        const r = turn(s, seat, 1, 0);
        s = r.state;
        const after = s.pieces[seat * 4].position,
          next = coordinates(after, seat, 0);
        if (after.kind !== 'HOME')
          expect(
            Math.max(Math.abs(next.x - at.x), Math.abs(next.y - at.y)),
          ).toBeLessThanOrEqual(1);
        if (after.kind === 'HALKI_HOME_RETURN') {
          sawReturn = true;
          expect(after.homeSeat).toBe(enemy);
          if (before.kind === 'HALKI_TRACK') expect(before.travelled).toBe(52);
        }
        if (
          before.kind === 'HALKI_TRACK' &&
          before.index === STARTS[seat] &&
          after.kind === 'HOME'
        )
          sawStartFinish = true;
      }
      expect(s.pieces[seat * 4].position.kind).toBe('HOME');
      expect(s.pieces[seat * 4].position).toEqual({
        kind: 'HOME',
        homeSeat: enemy,
      });
      expect(s.pieces[seat * 4].hasUsedHalki).toBe(true);
      expect(isHalki(s.pieces[seat * 4])).toBe(false);
      expect(sawReturn).toBe(true);
      expect(sawStartFinish).toBe(false);
      expect(steps).toBe(63);
    },
  );
  it('Halki must use an exact invaded-Home Finish roll', () => {
    const s = game();
    s.pieces[0].position = { kind: 'HALKI_HOME_RETURN', homeSeat: 1, index: 3 };
    expect(legalMoves({ ...s, dice: 3 }, 'p0')).toHaveLength(0);
    expect(turn(s, 0, 2, 0).state.pieces[0].position.kind).toBe('HOME');
  });
  it('losing allies on departure does not make a non-killing Halki move compulsory', () => {
    const s = game();
    s.pieces[0].position = h(6);
    s.pieces[1].position = track(6);
    s.pieces[8].position = track(6);
    s.pieces[4].position = h(6);
    s.pieces[2].position = track(20);
    syncSquares(s);
    const rolled = resolveRoll(s, 'p0', 1, 0);
    expect(legalMoves(rolled.state, 'p0').map((m) => m.pieceId)).toContain(
      'p0:2',
    );
    expect(
      legalMoves(rolled.state, 'p0').find((m) => m.pieceId === 'p0:0')!
        .knockIds,
    ).toEqual([]);
  });
  it('counts mixed Halki defenders as physical pieces and kills both', () => {
    const s = game();
    s.pieces[0].position = h(9);
    s.pieces[4].position = h(6);
    s.pieces[5].position = track(6);
    const r = turn(s, 0, 3, 0);
    expect(r.state.pieces[4].position.kind).toBe('BASE');
    expect(r.state.pieces[5].position.kind).toBe('BASE');
    expect(r.state.pieces[0].position).toMatchObject({
      kind: 'HALKI_TRACK',
      homeSeat: 1,
      index: 6,
    });
  });
  it.each([2, 3])(
    'multiple Halki defenders count as %i individual pieces',
    (count) => {
      const s = game();
      s.pieces[0].position = h(9);
      for (let i = 0; i < count; i++) s.pieces[4 + i].position = h(6);
      const r = turn(s, 0, 3, 0);
      expect(
        r.state.pieces
          .slice(4, 4 + count)
          .filter((p) => p.position.kind === 'BASE'),
      ).toHaveLength(count === 2 ? 2 : 0);
    },
  );
});
describe('permanent completion and team support', () => {
  function finish() {
    const s = game();
    for (let i = 0; i < 3; i++) s.pieces[i].position = { kind: 'HOME' };
    s.pieces[3].position = { kind: 'HOME_LANE', index: 4 };
    return turn(s, 0, 1, 3).state;
  }
  it('secures four permanently and starts four rotations', () => {
    const s = finish();
    expect(s.revenge!.secured).toEqual(['p0']);
    expect(s.revenge!.support.p0).toEqual({
      rotationsLeft: 4,
      pending: ['p1', 'p2', 'p3'],
      ready: false,
    });
    expect(legalMoves(s, 'p0', 6)).toEqual([]);
  });
  it('four individual turns complete only one full rotation', () => {
    let s = finish();
    s.timerSeconds = 1;
    for (let i = 0; i < 4; i++) {
      s.deadline = 1;
      s = resolveTimeout(s, 2).state;
    }
    expect(s.revenge!.support.p0.rotationsLeft).toBe(3);
    expect(s.revenge!.support.p0.ready).toBe(false);
  });
  it('four full rotations activate recurring helper with beneficiary-only movement and bonuses', () => {
    let s = finish();
    s.timerSeconds = 1;
    for (let i = 0; i < 12; i++) {
      s.deadline = 1;
      s = resolveTimeout(s, 2).state;
    }
    expect(s.revenge!.support.p0.ready).toBe(true);
    expect(s.currentPlayerId).toBe('p0');
    expect(s.revenge!.beneficiaryId).toBe('p2');
    expect(() => resolveRoll(s, 'p2', 6, 3)).toThrow();
    const r = resolveRoll(resolveRoll(s, 'p0', 6, 3).state, 'p0', 1, 3);
    expect(legalMoves(r.state, 'p0')).toEqual([]);
    expect(legalMoves(r.state, 'p2')).toHaveLength(4);
    expect(() => resolveMove(r.state, 'p0', 'p2:0', 3)).toThrow();
    const moved = resolveMove(r.state, 'p2', 'p2:0', 3);
    expect(moved.state.currentPlayerId).toBe('p0');
    expect(homeCount(moved.state, 'p0')).toBe(4);
    expect(moved.state.dice).toBe(1);
  });
  it('support bonus rolls do not count as rotations', () => {
    const s = finish();
    const first = turn(s, 1, 6, 0);
    expect(first.state.revenge!.support.p0.rotationsLeft).toBe(4);
    expect(first.state.revenge!.support.p0.pending).toContain('p1');
  });
  it('team wins only at actual eight Home, including a returning Halki', () => {
    const s = finish();
    s.pieces[8].position = { kind: 'HOME' };
    s.pieces[9].position = { kind: 'HOME' };
    s.pieces[10].position = { kind: 'HOME' };
    s.pieces[11].position = {
      kind: 'HALKI_HOME_RETURN',
      homeSeat: 1,
      index: 4,
    };
    const r = turn(s, 2, 1, 3);
    expect(r.state.winnerTeam).toBe('A');
    expect(r.state.phase).toBe('FINISHED');
    expect(r.state.revenge!.secured).toContain('p2');
  });
});

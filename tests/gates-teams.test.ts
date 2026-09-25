import { describe, expect, it } from 'vitest';
import {
  createMatch,
  legalMoves,
  resolveRoll,
  resolveMove,
  resolveTimeout,
  resolveForfeit,
  teamProgress,
  homeCount,
  type Mode,
} from '../shared/game';
import {
  HOME_GATES,
  SAFE_SPACES,
  type Position,
  type Seat,
} from '../shared/topology';
const members = ['GROOT', 'KIV', 'NIDA', 'NOOR'].map((name, i) => ({
  id: name,
  name,
  seat: i as Seat,
}));
const game = (mode: Mode = 'KNOCKOUT') =>
  createMatch('gates', members, 30, 1000, mode);
const track = (index: number, travelled = 10): Position => ({
  kind: 'TRACK',
  index,
  travelled,
});
const locked = (seat: Seat): Position => ({
  kind: 'HOME_GATE_LOCKED',
  index: HOME_GATES[seat],
  travelled: 50,
});
describe('exposed Home Gate', () => {
  it.each([1, 2, 3, 4, 5, 6])(
    'locked piece cannot use roll %i, but another legal piece can',
    (roll) => {
      const s = game();
      s.pieces[0].position = locked(0);
      s.pieces[1].position = track(2);
      const moves = legalMoves(s, 'GROOT', roll);
      expect(moves.some((m) => m.pieceId === 'GROOT:0')).toBe(false);
      expect(moves.some((m) => m.pieceId === 'GROOT:1')).toBe(true);
      s.dice = roll;
      expect(() => resolveMove(s, 'GROOT', 'GROOT:0')).toThrow();
    },
  );
  it.each([0, 1, 2, 3] as Seat[])(
    'gate %i is exposed; knocking its waiting piece resets its lap and unlocks the attacker',
    (seat) => {
      const s = game(),
        victim = s.players[seat],
        attacker = s.players[(seat + 1) % 4];
      s.pieces[seat * 4].position = locked(seat);
      s.pieces[((seat + 1) % 4) * 4].position = track(
        (HOME_GATES[seat] + 51) % 52,
      );
      s.currentPlayerId = attacker.id;
      s.dice = 1;
      expect(SAFE_SPACES.has(HOME_GATES[seat])).toBe(false);
      const r = resolveMove(s, attacker.id, `${attacker.id}:0`);
      expect(r.state.pieces[seat * 4].position).toEqual({ kind: 'BASE' });
      expect(r.state.players[seat].knocked).toBe(0);
      expect(r.state.players[seat].homeUnlocked).toBe(false);
      expect(r.state.players[(seat + 1) % 4].knocked).toBe(1);
      expect(r.state.players[(seat + 1) % 4].homeUnlocked).toBe(true);
      const k = r.events.find((e) => e.type === 'PIECE_KNOCKED');
      expect(k?.from).toEqual(locked(seat));
      r.state.currentPlayerId = victim.id;
      expect(
        legalMoves(r.state, victim.id, 5).some(
          (m) => m.pieceId === `${victim.id}:0`,
        ),
      ).toBe(false);
      expect(
        legalMoves(r.state, victim.id, 6).some(
          (m) => m.pieceId === `${victim.id}:0`,
        ),
      ).toBe(true);
    },
  );
  it('another piece unlocks every waiting piece without moving them', () => {
    const s = game();
    s.pieces[0].position = locked(0);
    s.pieces[1].position = locked(0);
    s.pieces[2].position = track(3);
    s.pieces[4].position = track(6);
    s.dice = 3;
    const r = resolveMove(s, 'GROOT', 'GROOT:2');
    expect(r.state.players[0].homeUnlocked).toBe(true);
    for (const i of [0, 1])
      expect(r.state.pieces[i].position).toEqual(track(50, 50));
    expect(
      r.events.filter((e) => e.type === 'PIECE_MOVED').map((e) => e.pieceId),
    ).toEqual(['GROOT:2']);
    r.state.currentPlayerId = 'GROOT';
    r.state.dice = 1;
    expect(
      legalMoves(r.state, 'GROOT')
        .filter((m) => ['GROOT:0', 'GROOT:1'].includes(m.pieceId))
        .map((m) => m.path),
    ).toEqual([
      [{ kind: 'HOME_LANE', index: 0 }],
      [{ kind: 'HOME_LANE', index: 0 }],
    ]);
  });
  it('unlocked waiting piece stays exposed until it leaves the gate', () => {
    const s = game();
    s.players[0].homeUnlocked = true;
    s.players[0].knocked = 1;
    s.pieces[0].position = track(50, 50);
    s.pieces[4].position = track(49);
    s.currentPlayerId = 'KIV';
    s.dice = 1;
    const r = resolveMove(s, 'KIV', 'KIV:0');
    expect(r.state.pieces[0].position.kind).toBe('BASE');
    expect(r.state.players[0].homeUnlocked).toBe(true);
  });
  it('multiple waiting pieces are individual, exposed occupants', () => {
    const s = game();
    s.pieces[0].position = locked(0);
    s.pieces[1].position = locked(0);
    s.pieces[4].position = track(49);
    s.currentPlayerId = 'KIV';
    s.dice = 1;
    const r = resolveMove(s, 'KIV', 'KIV:0');
    expect(
      r.state.pieces.slice(0, 2).every((p) => p.position.kind === 'BASE'),
    ).toBe(true);
    expect(r.state.players[1].knocked).toBe(2);
  });
  it('arriving at the gate can itself earn a first knock and leaves the piece there unlocked', () => {
    const s = game();
    s.pieces[0].position = track(49, 49);
    s.pieces[4].position = track(50);
    s.dice = 3;
    const r = resolveMove(s, 'GROOT', 'GROOT:0');
    expect(r.state.pieces[0].position).toEqual(track(50, 50));
    expect(r.state.players[0].homeUnlocked).toBe(true);
    expect(r.events.map((e) => e.type)).not.toContain('HOME_LOCKED');
  });
  it('all own pieces waiting produces no legal move and passes the turn', () => {
    const s = game();
    s.pieces
      .filter((p) => p.ownerId === 'GROOT')
      .forEach((p) => {
        p.position = locked(0);
      });
    const r = resolveRoll(s, 'GROOT', 6);
    expect(r.state.currentPlayerId).toBe('KIV');
    expect(r.events.at(-1)?.type).toBe('NO_MOVES');
  });
  it('multiple pieces may arrive at the same locked gate', () => {
    const s = game();
    s.pieces[0].position = locked(0);
    s.pieces[1].position = track(48, 48);
    s.dice = 4;
    const r = resolveMove(s, 'GROOT', 'GROOT:1');
    expect(r.state.pieces[1].position).toEqual(locked(0));
    expect(r.state.players[0].knocked).toBe(0);
  });
});
describe('KNOCKOUT 2v2', () => {
  it.each([2, 3])('rejects %i active players', (count) => {
    expect(() =>
      createMatch('bad', members.slice(0, count), 0, 0, 'KNOCKOUT_2V2'),
    ).toThrow('four');
  });
  it('assigns opposite seats together and sorts the real board turn order', () => {
    const s = createMatch(
      'team',
      [members[2], members[0], members[3], members[1]],
      0,
      0,
      'KNOCKOUT_2V2',
    );
    expect(s.players.map((p) => [p.name, p.team])).toEqual([
      ['GROOT', 'A'],
      ['KIV', 'B'],
      ['NIDA', 'A'],
      ['NOOR', 'B'],
    ]);
    const turns = [];
    let current = s;
    for (let i = 0; i < 5; i++) {
      turns.push(current.currentPlayerId);
      current = resolveRoll(current, current.currentPlayerId, 1).state;
    }
    expect(turns).toEqual(['GROOT', 'KIV', 'NIDA', 'NOOR', 'GROOT']);
  });
  it('teammates share exposed spaces without capture or unlock', () => {
    const s = game('KNOCKOUT_2V2');
    s.pieces[0].position = track(3);
    s.pieces[8].position = track(6);
    s.pieces[9].position = track(6);
    s.dice = 3;
    const r = resolveMove(s, 'GROOT', 'GROOT:0');
    expect(r.state.pieces[8].position.kind).toBe('TRACK');
    expect(r.state.players[0].knocked).toBe(0);
    expect(r.events.map((e) => e.type)).toEqual(['PIECE_MOVED']);
  });
  it('passing a friendly or enemy stack is legal', () => {
    const s = game('KNOCKOUT_2V2');
    s.pieces[0].position = track(1);
    s.pieces[8].position = track(3);
    s.pieces[9].position = track(3);
    s.pieces[4].position = track(4);
    s.pieces[5].position = track(4);
    expect(legalMoves(s, 'GROOT', 5)[0].path).toHaveLength(5);
  });
  it('respects the opposing two-color shield while preserving all occupants', () => {
    const s = game('KNOCKOUT_2V2');
    s.pieces[0].position = track(3);
    for (const i of [4, 8, 12]) s.pieces[i].position = track(6);
    s.dice = 3;
    const r = resolveMove(s, 'GROOT', 'GROOT:0');
    expect(r.state.players[0].knocked).toBe(0);
    expect(r.state.pieces[8].position.kind).toBe('TRACK');
    expect(r.state.pieces[4].position.kind).toBe('TRACK');
    expect(r.state.pieces[12].position.kind).toBe('TRACK');
  });
  it('a knock unlocks the attacker only; their partner stays individually locked', () => {
    const s = game('KNOCKOUT_2V2');
    s.pieces[0].position = locked(0);
    s.pieces[8].position = locked(2);
    s.pieces[1].position = track(3);
    s.pieces[4].position = track(6);
    s.dice = 3;
    const r = resolveMove(s, 'GROOT', 'GROOT:1');
    expect(r.state.players[0].homeUnlocked).toBe(true);
    expect(r.state.players[2].homeUnlocked).toBe(false);
    expect(r.state.pieces[0].position).toEqual(track(50, 50));
    expect(r.state.pieces[8].position).toEqual(locked(2));
  });
  it.each(['NIDA', 'KIV'])(
    '%s interacts with GROOT’s locked gate according to team',
    (id) => {
      const s = game('KNOCKOUT_2V2');
      s.pieces[0].position = locked(0);
      const attacker = s.pieces.find((p) => p.id === `${id}:0`)!;
      attacker.position = track(49);
      s.currentPlayerId = id;
      s.dice = 1;
      const r = resolveMove(s, id, attacker.id);
      expect(r.state.pieces[0].position.kind).toBe(
        id === 'NIDA' ? 'HOME_GATE_LOCKED' : 'BASE',
      );
    },
  );
  it('4/4 personal progress continues play and skips the finished player on subsequent turns', () => {
    const s = game('KNOCKOUT_2V2');
    s.players[0].homeUnlocked = true;
    s.players[0].knocked = 1;
    for (let i = 0; i < 3; i++) s.pieces[i].position = { kind: 'HOME' };
    s.pieces[3].position = track(50, 50);
    s.dice = 6;
    let r = resolveMove(s, 'GROOT', 'GROOT:3').state;
    expect(r.phase).toBe('PLAYING');
    expect(homeCount(r, 'GROOT')).toBe(4);
    expect(teamProgress(r, 'A')).toBe(4);
    expect(r.currentPlayerId).toBe('KIV');
    for (let i = 0; i < 3; i++) r = resolveRoll(r, r.currentPlayerId, 1).state;
    expect(r.currentPlayerId).toBe('KIV');
  });
  it.each(['A', 'B'] as const)(
    'team %s wins only when all eight combined pieces are Home',
    (team) => {
      const s = game('KNOCKOUT_2V2'),
        pair = s.players.filter((p) => p.team === team),
        finisher = pair[1];
      for (const p of pair) {
        p.homeUnlocked = true;
        p.knocked = 1;
        for (const piece of s.pieces.filter((x) => x.ownerId === p.id))
          piece.position = { kind: 'HOME' };
      }
      s.pieces.find((p) => p.id === `${finisher.id}:3`)!.position = {
        kind: 'HOME_LANE',
        index: 4,
      };
      s.currentPlayerId = finisher.id;
      s.dice = 1;
      expect(teamProgress(s, team)).toBe(7);
      const r = resolveMove(s, finisher.id, `${finisher.id}:3`);
      expect(r.state.phase).toBe('FINISHED');
      expect(r.state.winnerTeam).toBe(team);
      expect(teamProgress(r.state, team)).toBe(8);
      expect(r.events.at(-1)?.type).toBe('TEAM_WON');
    },
  );
  it('timeout skips a finished teammate and preserves teams and gate positions', () => {
    const s = game('KNOCKOUT_2V2');
    s.pieces
      .filter((p) => p.ownerId === 'KIV')
      .forEach((p) => {
        p.position = { kind: 'HOME' };
      });
    s.pieces[8].position = locked(2);
    const r = resolveTimeout(s, 31000).state;
    expect(r.currentPlayerId).toBe('NIDA');
    expect(r.players.map((p) => p.team)).toEqual(['A', 'B', 'A', 'B']);
    expect(r.pieces[8].position).toEqual(locked(2));
  });
  it('forfeiting a team seat awards the opposing team without transferring pieces', () => {
    const s = game('KNOCKOUT_2V2'),
      r = resolveForfeit(s, 'GROOT').state;
    expect(r.winnerTeam).toBe('B');
    expect(r.winReason).toBe('FORFEIT');
    expect(r.pieces).toEqual(s.pieces);
  });
});

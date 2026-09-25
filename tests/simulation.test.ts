import { describe, it, expect } from 'vitest';
import {
  createMatch,
  resolveRoll,
  resolveMove,
  legalMoves,
  teamProgress,
  type Mode,
} from '../shared/game';
import { isTeamMode } from '../shared/modes';
import type { Seat } from '../shared/topology';
describe('complete reproducible matches', () => {
  for (const [count, mode] of [
    [2, 'KNOCKOUT'],
    [3, 'KNOCKOUT'],
    [4, 'KNOCKOUT'],
    [4, 'KNOCKOUT_2V2'],
    [4, 'REVENGE_TEAM'],
    [2, 'REVENGE_SOLO'],
    [3, 'REVENGE_SOLO'],
    [4, 'REVENGE_SOLO'],
  ] as [number, Mode][])
    for (const seed of [13, 27, 59, 101])
      it(`${mode}, ${count} players, seed ${seed}: finishes with valid positions and the required Home count`, () => {
        const players = Array.from({ length: count }, (_, i) => ({
          id: `p${i}`,
          name: ['GROOT', 'KIV', 'NIDA', 'NOOR'][i],
          seat: i as Seat,
        }));
        let s = createMatch('simulation', players, 0, Date.now(), mode),
          rng = seed,
          actions = 0;
        function die() {
          rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
          return 1 + Math.floor((rng / 4294967296) * 6);
        }
        while (s.phase === 'PLAYING' && actions++ < 15000) {
          if (s.dice === null)
            s = resolveRoll(s, s.currentPlayerId, die()).state;
          else {
            const actor = s.revenge?.beneficiaryId ?? s.currentPlayerId;
            const moves = legalMoves(s, actor);
            expect(moves.length).toBeGreaterThan(0);
            const ranked = moves
              .map((m) => {
                const p = s.pieces.find((p) => p.id === m.pieceId)!,
                  end = m.path.at(-1)!;
                return {
                  m,
                  score:
                    (end.kind === 'HOME'
                      ? 1000
                      : end.kind === 'HOME_LANE' ||
                          end.kind === 'HALKI_HOME_RETURN'
                        ? 500
                        : 0) +
                    m.knockIds.length * 250 +
                    (p.position.kind === 'BASE' ? 80 : 0) +
                    (end.kind === 'TRACK' ? end.travelled : 0),
                };
              })
              .sort((a, b) => b.score - a.score);
            s = resolveMove(
              s,
              actor,
              ranked[0].m.pieceId,
              Date.now(),
              ranked[0].m.targetId,
              ranked[0].m.dieId,
            ).state;
          }
          expect(new Set(s.pieces.map((p) => p.id)).size).toBe(count * 4);
          for (const p of s.pieces) {
            if (
              p.position.kind === 'TRACK' ||
              p.position.kind === 'HALKI_TRACK'
            ) {
              expect(p.position.index).toBeGreaterThanOrEqual(0);
              expect(p.position.index).toBeLessThan(52);
            }
            if (p.position.kind === 'HOME_LANE') {
              expect(p.position.index).toBeGreaterThanOrEqual(0);
              expect(p.position.index).toBeLessThan(5);
              expect(
                s.players.find((o) => o.id === p.ownerId)!.homeUnlocked,
              ).toBe(true);
            }
          }
          for (const p of s.players) expect(p.homeUnlocked).toBe(p.knocked > 0);
          if (s.revenge) {
            expect(s.revenge.rulePending).toBeNull();
            for (const id of s.revenge.secured)
              expect(
                s.pieces.filter(
                  (p) => p.ownerId === id && p.position.kind === 'HOME',
                ),
              ).toHaveLength(4);
          }
        }
        expect(s.phase).toBe('FINISHED');
        expect(s.winReason).toBe('HOME');
        if (isTeamMode(mode)) expect(teamProgress(s, s.winnerTeam!)).toBe(8);
        expect(
          s.pieces.filter(
            (p) => p.ownerId === s.winner && p.position.kind === 'HOME',
          ),
        ).toHaveLength(4);
      });
});

import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMatch } from '../shared/game';
import type { Seat } from '../shared/topology';
import { localPieceNumbers } from '../shared/turn-presentation';
import { stackPresentation } from '../shared/stack-presentation';
import { Board } from '../components/game/Board';
import { revengeGuideScene } from '../components/game/RevengeTutorial';
const game = () =>
  createMatch(
    'numbers',
    [0, 1, 2, 3].map((seat) => ({
      id: `p${seat}`,
      name: `Player ${seat}`,
      seat: seat as Seat,
    })),
    0,
    0,
    'REVENGE',
  );
it.each([0, 1, 2, 3])(
  'seat %i sees only its own stable numbers on its turn',
  (seat) => {
    const s = game();
    s.currentPlayerId = `p${seat}`;
    s.revenge!.beneficiaryId = s.currentPlayerId;
    const ids = localPieceNumbers(s, s.currentPlayerId);
    expect(ids).toEqual([0, 1, 2, 3].map((n) => `p${seat}:${n}`));
    const html = renderToStaticMarkup(
      createElement(Board, { pieces: s.pieces, numbered: ids }),
    );
    expect(html.match(/class="piece-number"/g)).toHaveLength(4);
    expect(localPieceNumbers(s, `p${(seat + 1) % 4}`)).toEqual([]);
    expect(localPieceNumbers(s, 'spectator')).toEqual([]);
  },
);
it('turn changes remove the previous client labels and give the next client its own', () => {
  const s = game();
  expect(localPieceNumbers(s, 'p0')).toHaveLength(4);
  s.currentPlayerId = 'p2';
  s.revenge!.beneficiaryId = 'p2';
  expect(localPieceNumbers(s, 'p0')).toEqual([]);
  expect(localPieceNumbers(s, 'p2')).toHaveLength(4);
});
it('Halki, finished, used-life and Base transitions never renumber physical pieces', () => {
  const s = game();
  s.pieces[1].position = {
    kind: 'HALKI_TRACK',
    index: 6,
    travelled: 3,
    homeSeat: 1,
  };
  s.pieces[1].hasUsedHalki = true;
  s.pieces[2].position = { kind: 'HOME' };
  const before = localPieceNumbers(s, 'p0');
  s.pieces[1].position = { kind: 'BASE' };
  expect(localPieceNumbers(s, 'p0')).toEqual(before);
  expect(s.pieces.slice(0, 4).map((p) => p.number)).toEqual([0, 1, 2, 3]);
});
it('local stacked pieces stay layered while the chooser keeps IDs and logical positions', () => {
  const s = game();
  for (const i of [0, 2, 4, 8])
    s.pieces[i].position = { kind: 'TRACK', index: 6, travelled: 6 };
  const before = structuredClone(s.pieces);
  const layout = stackPresentation(
    s.pieces,
    ['p0:0', 'p0:2'],
    0,
    localPieceNumbers(s, 'p0'),
  );
  expect(layout.slice(-2).map((x) => x.piece.id)).toEqual(['p0:0', 'p0:2']);
  expect(layout.at(-1)!.x).toBe(0);
  expect(layout.at(-2)!.x).toBe(0);
  expect(layout.at(-1)!.top).toBe(true);
  expect(layout.at(-2)!.top).toBe(false);
  expect(s.pieces).toEqual(before);
  expect(layout.at(-1)!.choices).toEqual(['p0:0', 'p0:2']);
});
it('helper numbering belongs to the beneficiary, with no new KNOCKOUT labels', () => {
  const s = game();
  s.revenge!.secured = ['p0'];
  s.revenge!.beneficiaryId = 'p2';
  expect(localPieceNumbers(s, 'p0')).toEqual([]);
  expect(localPieceNumbers(s, 'p2')).toHaveLength(4);
  s.mode = 'KNOCKOUT';
  expect(localPieceNumbers(s, 'p2')).toEqual([]);
});
it('all 18 Revenge tutorial scenes resolve through the corrected engine', () => {
  for (let step = 0; step < 18; step++) {
    const scene = revengeGuideScene(step);
    expect(scene.initial.pieces).toHaveLength(16);
    expect(scene.stages.every((x) => !x.state.revenge?.rulePending)).toBe(true);
  }
});

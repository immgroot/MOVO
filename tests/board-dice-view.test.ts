import { it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Board } from '../components/game/Board';
import { Die } from '../components/game/Die';
import { BoardSelector } from '../components/game/Cosmetics';
import {
  createMatch,
  resolveRoll,
  resolveMove,
  type Mode,
} from '../shared/game';
import { MODES } from '../shared/modes';
import { projectBoardPoint, viewSeat } from '../shared/board-view';
import { diceFace, DICE_ROLL_MS } from '../shared/dice-presentation';
import { baseCell, coordinates, type Seat } from '../shared/topology';
import { boardStyle, type BoardStyle } from '../shared/cosmetics';
const game = (mode: Mode) =>
  createMatch(
    'view',
    [0, 1, 2, 3].map((seat) => ({
      id: 'p' + seat,
      name: 'Player ' + seat,
      seat: seat as Seat,
    })),
    0,
    0,
    mode,
  );
it.each(MODES)(
  '%s personal POV keeps server positions and tile IDs unchanged',
  (mode) => {
    const match = game(mode),
      before = structuredClone(match);
    const ids = (html: string) =>
      [...html.matchAll(/data-square="([^"]+)"/g)].map((m) => m[1]);
    const neutral = renderToStaticMarkup(
      createElement(Board, { pieces: match.pieces }),
    );
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      const point = projectBoardPoint(baseCell(seat, 0), seat);
      expect(point.y).toBeGreaterThan(7);
      expect(point.x).toBeCloseTo(baseCell(0, 0).x);
      expect(point.y).toBeCloseTo(baseCell(0, 0).y);
      expect(viewSeat(seat, seat)).toBe(0);
      const html = renderToStaticMarkup(
        createElement(Board, { pieces: match.pieces, viewerSeat: seat }),
      );
      expect(ids(html)).toEqual(ids(neutral));
      expect(ids(html)).toHaveLength(52);
      expect(html).toContain('data-viewer-seat="' + seat + '"');
    }
    expect(neutral).toContain('data-viewer-seat="spectator"');
    expect(match).toEqual(before);
  },
);
it.each(['classic', 'premium', 'colorful'] as BoardStyle[])(
  '%s has physical finish slots and no filler writing',
  (theme) => {
    const match = game('REVENGE_TEAM');
    match.pieces.slice(0, 4).forEach((p) => (p.position = { kind: 'HOME' }));
    const html = renderToStaticMarkup(
      createElement(Board, { pieces: match.pieces, theme }),
    );
    expect(html.match(/data-finish-slot=/g)).toHaveLength(16);
    for (let n = 0; n < 4; n++) {
      const c = coordinates({ kind: 'HOME' }, 0, n);
      expect(c.y).toBeLessThan(8.1);
      expect(c.y).toBeGreaterThan(7);
      expect(c).not.toEqual(baseCell(0, n));
      expect(html).toContain('data-position="HOME-0-' + n + '"');
    }
    expect(
      new Set(
        [0, 1, 2, 3].map((n) =>
          JSON.stringify(coordinates({ kind: 'HOME' }, 0, n)),
        ),
      ).size,
    ).toBe(4);
    expect(html).not.toContain('THE ORIGINAL KNOCKOUT BOARD');
    expect(html).not.toContain('WINNING ISN');
    expect(html).toContain('data-board-theme="' + theme + '"');
  },
);
it('the exact finished token leaves its slot when activated', () => {
  const match = game('REVENGE_TEAM');
  match.pieces[0].position = { kind: 'HOME' };
  match.pieces[1].position = { kind: 'HOME' };
  match.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
  const rolled = resolveRoll(
    resolveRoll(match, 'p0', 6, 0).state,
    'p0',
    4,
    0,
  ).state;
  const next = resolveMove(rolled, 'p0', 'p0:1', 0, 'p1', '1:1').state;
  const html = renderToStaticMarkup(
    createElement(Board, { pieces: next.pieces }),
  );
  expect(next.pieces[0].position.kind).toBe('HOME');
  expect(next.pieces[1].position.kind).toBe('HALKI_HOME_INVASION');
  expect(html).toContain('data-position="HOME-0-0"');
  expect(html).not.toContain('data-position="HOME-0-1"');
});
it.each([1, 2, 3, 4, 5, 6])(
  'final visible die always equals authoritative %i',
  (value) => {
    const frames = [0, 60, 130, 220, 335, 465, 600, DICE_ROLL_MS].map((t) =>
      diceFace(value, t, true),
    );
    expect(new Set(frames).size).toBeGreaterThan(3);
    expect(frames.at(-1)).toBe(value);
    for (const t of [0, 20, 330, 860, 5000]) {
      expect(diceFace(value, t, false)).toBe(value);
      expect(diceFace(value, t, true, true)).toBe(value);
    }
    const html = renderToStaticMarkup(
      createElement(Die, {
        value,
        rolling: false,
        disabled: true,
        onRoll: () => {},
      }),
    );
    expect(html).toContain('data-visible-face="' + value + '"');
    expect(html).toContain('Die result: ' + value);
  },
);
it('Colorful is selectable and round-trips the stored preference', () => {
  expect(boardStyle('colorful')).toBe('colorful');
  const html = renderToStaticMarkup(
    createElement(BoardSelector, { value: 'colorful', onChange: () => {} }),
  );
  expect(html).toContain('MOVO COLORFUL');
  expect(html).toContain('aria-label="MOVO Colorful"');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});

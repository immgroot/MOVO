import { it, expect } from 'vitest';
import {
  stackPresentation,
  type StackPiece,
} from '../shared/stack-presentation';
import type { Seat } from '../shared/topology';
const pieces = (count = 4): StackPiece[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    seat: (i % 4) as Seat,
    number: Math.floor(i / 4),
    position: { kind: 'TRACK', index: 6, travelled: 5 },
  }));
it.each([0, 1, 2, 3])(
  'seat %i legal piece draws last without moving any logical piece',
  (seat) => {
    const s = pieces(),
      before = structuredClone(s);
    const result = stackPresentation(s, [`p${seat}`], seat);
    expect(result.at(-1)!.piece.id).toBe(`p${seat}`);
    expect(result.at(-1)!.priority).toBe(2);
    expect(s).toEqual(before);
    expect(new Set(result.map((p) => `${p.x},${p.y}`)).size).toBe(4);
    expect(
      result.every(
        (p) =>
          p.piece.position === s.find((x) => x.id === p.piece.id)!.position,
      ),
    ).toBe(true);
  },
);
it.each([2, 3, 4, 8, 16])(
  '%i stacked pieces retain distinct visible offsets',
  (count) => {
    const layout = stackPresentation(pieces(count), ['p0'], 0);
    expect(new Set(layout.map((p) => `${p.x},${p.y}`)).size).toBe(count);
    expect(
      layout.every((p) => Math.abs(p.x) <= 26 && Math.abs(p.y) <= 26),
    ).toBe(true);
  },
);
it('turn changes the physical top without changing logical positions', () => {
  const s = pieces(),
    a = stackPresentation(s, ['p0'], 0),
    b = stackPresentation(s, ['p2'], 2);
  expect(a.at(-1)!.piece.id).toBe('p0');
  expect(b.at(-1)!.piece.id).toBe('p2');
  expect(a.find((p) => p.top)?.piece.id).toBe('p0');
  expect(b.find((p) => p.top)?.piece.id).toBe('p2');
  expect(a.every((p) => p.x === 0)).toBe(true);
  expect(
    b.every(
      (p) => p.piece.position.kind === 'TRACK' && p.piece.position.index === 6,
    ),
  ).toBe(true);
});
it('multiple legal local pieces are offered together and helper movement outranks the roller', () => {
  const s = pieces(8),
    layout = stackPresentation(s, ['p2', 'p6'], 0);
  expect(layout.slice(-2).map((x) => x.piece.id)).toEqual(['p2', 'p6']);
  expect(layout.at(-1)!.choices).toEqual(['p2', 'p6']);
  expect(layout.some((p) => p.priority === 0)).toBe(true);
});

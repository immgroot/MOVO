export type Seat = 0 | 1 | 2 | 3;
export type Position =
  | { kind: 'BASE' }
  | { kind: 'TRACK'; index: number; travelled: number }
  | { kind: 'HOME_GATE_LOCKED'; index: number; travelled: number }
  | { kind: 'HOME_LANE'; index: number }
  | { kind: 'HALKI_TRACK'; homeSeat: Seat; index: number; travelled: number }
  | { kind: 'HALKI_HOME_INVASION'; homeSeat: Seat; index: number }
  | { kind: 'HALKI_HOME_RETURN'; homeSeat: Seat; index: number }
  | { kind: 'HOME'; homeSeat?: Seat };
export const TRACK_LENGTH = 52;
export const LANE_LENGTH = 5;
export const COLORS = ['#d45d49', '#369b77', '#d4a431', '#487fc4'] as const;
export const MARKS = ['◆', '✳', '▲', '≋'] as const;
export const COLOR_NAMES = ['Terracotta', 'Sage', 'Ochre', 'Slate'] as const;
export const STARTS = [0, 13, 26, 39] as const;
export const HOME_GATES = [50, 11, 24, 37] as const;
export const SAFE_SPACES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// One continuous clockwise circuit. Coordinates are presentation data only.
const quarter: [number, number][] = [
  [6, 13],
  [6, 12],
  [6, 11],
  [6, 10],
  [6, 9],
  [5, 8],
  [4, 8],
  [3, 8],
  [2, 8],
  [1, 8],
  [0, 8],
  [0, 7],
  [0, 6],
];
function rotate([x, y]: [number, number], times: number): [number, number] {
  for (let i = 0; i < times; i++) [x, y] = [14 - y, x];
  return [x, y];
}
export const TRACK = Array.from({ length: TRACK_LENGTH }, (_, index) => {
  const [x, y] = rotate(quarter[index % 13], Math.floor(index / 13));
  return {
    id: `t${index}`,
    index,
    next: (index + 1) % 52,
    safe: SAFE_SPACES.has(index),
    x,
    y,
  };
});
export function laneCell(seat: Seat, index: number) {
  const [x, y] = rotate([7, 13 - index], seat);
  return { x, y, id: `l${seat}-${index}` };
}
export function baseCell(seat: Seat, piece: number) {
  const [x, y] = rotate(
    [2.15 + (piece % 2) * 1.85, 10.15 + Math.floor(piece / 2) * 1.85],
    seat,
  );
  return { x, y };
}
export function coordinates(position: Position, seat: Seat, piece: number) {
  if (position.kind === 'HALKI_TRACK') return TRACK[position.index];
  if (position.kind === 'HALKI_HOME_INVASION')
    return laneCell(position.homeSeat, position.index);
  if (position.kind === 'HALKI_HOME_RETURN')
    return laneCell(position.homeSeat, position.index);
  if (isOuter(position)) return TRACK[position.index];
  if (position.kind === 'HOME_LANE') return laneCell(seat, position.index);
  if (position.kind === 'HOME') {
    const [x, y] = rotate(
      [6.78 + (piece % 2) * 0.44, 7.54 + Math.floor(piece / 2) * 0.44],
      position.homeSeat ?? seat,
    );
    return { x, y };
  }
  return baseCell(seat, piece);
}
export function positionKey(position: Position, seat: Seat, piece: number) {
  if (position.kind === 'HOME' && position.homeSeat !== undefined)
    return `HOME-${position.homeSeat}-${piece}`;
  if (position.kind === 'HALKI_TRACK') return `t${position.index}`;
  if (position.kind === 'HALKI_HOME_INVASION')
    return `l${position.homeSeat}-${position.index}`;
  if (position.kind === 'HALKI_HOME_RETURN')
    return `l${position.homeSeat}-${position.index}`;
  if (isOuter(position)) return `t${position.index}`;
  if (position.kind === 'HOME_LANE') return `l${seat}-${position.index}`;
  return `${position.kind}-${seat}-${piece}`;
}
export function nextPosition(
  position: Position,
  seat: Seat,
  unlocked: boolean,
): Position | null {
  if (isOuter(position)) {
    if (position.kind === 'HOME_GATE_LOCKED' && !unlocked) return null;
    if (position.index === HOME_GATES[seat] && position.travelled >= 50)
      return unlocked ? { kind: 'HOME_LANE', index: 0 } : null;
    const next = {
      kind: 'TRACK',
      index: (position.index + 1) % TRACK_LENGTH,
      travelled: position.travelled + 1,
    } as const;
    return next.index === HOME_GATES[seat] && next.travelled >= 50 && !unlocked
      ? { ...next, kind: 'HOME_GATE_LOCKED' }
      : next;
  }
  if (position.kind === 'HOME_LANE')
    return position.index === LANE_LENGTH - 1
      ? { kind: 'HOME' }
      : { kind: 'HOME_LANE', index: position.index + 1 };
  return null;
}
export function isOuter(
  position: Position,
): position is Extract<Position, { kind: 'TRACK' | 'HOME_GATE_LOCKED' }> {
  return position.kind === 'TRACK' || position.kind === 'HOME_GATE_LOCKED';
}

import { positionKey, type Position, type Seat } from './topology';
export interface StackPiece {
  id: string;
  seat: Seat;
  number: number;
  position: Position;
}
/** Pure presentation: never writes authoritative pieces, positions or occupancy. */
export function stackPresentation<T extends StackPiece>(
  pieces: T[],
  legal: string[],
  active?: number,
  _numbered: string[] = [],
  moving: string[] = [],
) {
  const groups = new Map<string, T[]>();
  for (const p of pieces) {
    if (moving.includes(p.id)) continue;
    const key = positionKey(p.position, p.seat, p.number);
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  return pieces
    .map((piece) => {
      const key = positionKey(piece.position, piece.seat, piece.number);
      // An airborne piece stays independent until its landing completes.
      // The destination stack must not react while the attacker is in transit.
      const group = (moving.includes(piece.id) ? [piece] : groups.get(key)!)
        .slice()
        .sort(
          (a, b) =>
            Number(moving.includes(a.id)) - Number(moving.includes(b.id)) ||
            Number(legal.includes(a.id)) - Number(legal.includes(b.id)) ||
            Number(a.seat === active) - Number(b.seat === active) ||
            a.seat - b.seat ||
            a.number - b.number ||
            a.id.localeCompare(b.id),
        );
      const slot = group.findIndex((p) => p.id === piece.id),
        count = group.length;
      const x = 0,
        y =
          count > 1
            ? (count - 1 - slot) * Math.min(3.5, 14 / (count - 1)) - 3
            : 0;
      const selectable = legal.includes(piece.id),
        priority = moving.includes(piece.id)
          ? 3
          : selectable
            ? 2
            : piece.seat === active
              ? 1
              : 0;
      return {
        piece,
        key,
        count,
        top: slot === count - 1,
        layer: slot,
        occupants: group.map((p) => ({
          id: p.id,
          seat: p.seat,
          number: p.number,
        })),
        x,
        y,
        priority,
        selectable,
        choices: group.filter((p) => legal.includes(p.id)).map((p) => p.id),
      };
    })
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.piece.seat - b.piece.seat ||
        a.piece.number - b.piece.number,
    );
}

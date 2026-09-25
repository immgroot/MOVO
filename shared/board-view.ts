import type { Seat } from './topology';
/** Rendering only: server seats, tile IDs and route positions stay unchanged. */
export const viewSeat = (seat: Seat, viewer?: Seat | null): Seat =>
  ((seat - (viewer ?? 0) + 4) % 4) as Seat;
export function projectBoardPoint(
  point: { x: number; y: number },
  viewer?: Seat | null,
) {
  let { x, y } = point;
  for (let n = 0; n < (viewer ?? 0); n++) [x, y] = [y, 14 - x];
  return { x, y };
}

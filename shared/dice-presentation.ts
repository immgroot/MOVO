/** Visual frames only. Never imported by the rules or server. */
export const DICE_ROLL_MS = 860;
export const DICE_REDUCED_MS = 140;
export function diceFace(
  final: number | null,
  elapsed: number,
  rolling: boolean,
  reduced = false,
) {
  const result = final ?? 6;
  if (!rolling || reduced || elapsed >= 600) return result;
  const times = [0, 60, 130, 220, 335, 465];
  const frame = times.filter((t) => elapsed >= t).length - 1;
  return ((result + [2, 5, 1, 4, 3, 0][Math.max(0, frame)] - 1) % 6) + 1;
}

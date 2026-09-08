// Original procedural recordings: filtered noise, damped material resonances,
// and fixed-pitch chimes. No external samples or oscillator pitch sweeps.
export type Material =
  | 'wood'
  | 'plastic'
  | 'felt'
  | 'knock'
  | 'chime'
  | 'swell';
export interface SoundNote {
  material: Material;
  at: number;
  gain: number;
  pitch?: number;
}
const note = (
  material: Material,
  gain: number,
  at = 0,
  pitch = 1,
): SoundNote => ({ material, gain, at, pitch });
export const soundRecipes = {
  ui: [note('felt', 0.09)],
  dice: [
    note('plastic', 0.28),
    note('plastic', 0.22, 0.065),
    note('wood', 0.18, 0.14),
    note('plastic', 0.26, 0.23),
    note('wood', 0.22, 0.35),
    note('plastic', 0.17, 0.48),
  ],
  land: [note('wood', 0.3), note('plastic', 0.11, 0.038)],
  hop: [note('wood', 0.14)],
  reverse: [note('wood', 0.14, 0, 0.93)],
  lift: [note('felt', 0.05)],
  knock: [note('knock', 0.53), note('plastic', 0.19, 0.025)],
  return: [note('felt', 0.1)],
  shield: [note('knock', 0.29, 0, 0.82), note('chime', 0.12, 0.025, 0.5)],
  home: [note('chime', 0.25, 0, 1), note('chime', 0.18, 0.12, 1.5)],
  entry: [note('wood', 0.19), note('chime', 0.18, 0.055)],
  halki: [note('swell', 0.25, 0, 0.5), note('chime', 0.21, 0.16, 0.75)],
  turn: [note('chime', 0.22, 0, 0.75), note('chime', 0.12, 0.1, 1)],
  win: [
    note('chime', 0.33),
    note('chime', 0.28, 0.12, 1.25),
    note('chime', 0.27, 0.24, 1.5),
    note('chime', 0.29, 0.4, 2),
  ],
  chat: [note('felt', 0.08), note('chime', 0.055, 0, 1.5)],
} satisfies Record<string, SoundNote[]>;
export type Recipe = keyof typeof soundRecipes;
export function renderMaterial(
  material: Material,
  sampleRate: number,
  variant: number,
): Float32Array<ArrayBuffer> {
  const melodic = material === 'chime' || material === 'swell';
  const duration =
    material === 'swell'
      ? 0.6
      : melodic
        ? 0.44
        : material === 'knock'
          ? 0.18
          : material === 'felt'
            ? 0.055
            : 0.1;
  const data = new Float32Array(Math.ceil(sampleRate * duration));
  let seed = (variant + 1) * 7919 + 137,
    low = 0,
    peak = 0;
  const hz =
    (material === 'plastic'
      ? 1250
      : material === 'knock'
        ? 165
        : material === 'wood'
          ? 370
          : 440) *
    (1 + (variant - 1.5) * 0.012);
  for (let i = 0; i < data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const t = i / sampleRate,
      noise = seed / 2147483648 - 1;
    low += (noise - low) * (material === 'plastic' ? 0.42 : 0.14);
    const attack = Math.min(
      1,
      t / (material === 'swell' ? 0.13 : melodic ? 0.006 : 0.0008),
    );
    const tail = Math.min(1, (duration - t) / 0.012);
    const decay = Math.exp(
      -t /
        (material === 'swell'
          ? 0.21
          : melodic
            ? 0.115
            : material === 'knock'
              ? 0.028
              : 0.017),
    );
    const body =
      Math.sin(2 * Math.PI * hz * t) +
      0.32 *
        Math.sin(2 * Math.PI * hz * (melodic ? 2 : 2.63) * t) *
        Math.exp(-t / 0.035);
    const value =
      attack *
      tail *
      decay *
      (melodic
        ? body * 0.72
        : low * 1.9 + body * (material === 'felt' ? 0.025 : 0.16));
    data[i] = value;
    peak = Math.max(peak, Math.abs(value));
  }
  // Uniform material headroom; recipe gain determines the mix hierarchy.
  if (peak) for (let i = 0; i < data.length; i++) data[i] *= 0.8 / peak;
  return data;
}

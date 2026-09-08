import { renderMaterial, soundRecipes, type Recipe } from './audio-design';
import {
  boardStyle,
  publicCosmetics,
  type BoardStyle,
} from '../shared/cosmetics';
export interface Preferences {
  boardTheme: BoardStyle;
  avatar: string;
  banner: string;
  mute: boolean;
  master: number;
  sfx: number;
  reduced: boolean;
  haptics: boolean;
  hints: boolean;
}
export const defaults: Preferences = {
  boardTheme: 'premium',
  avatar: 'movo',
  banner: 'classic',
  mute: false,
  master: 0.5,
  sfx: 0.5,
  reduced: false,
  haptics: false,
  hints: true,
};
export function normalizePreferences(
  value: Partial<Preferences> = {},
  initialReduced = false,
): Preferences {
  const result = {
    ...defaults,
    ...publicCosmetics(value),
    boardTheme: boardStyle(value.boardTheme),
    reduced: initialReduced,
  };
  for (const key of ['mute', 'reduced', 'haptics', 'hints'] as const)
    if (typeof value[key] === 'boolean') result[key] = value[key]!;
  for (const key of ['master', 'sfx'] as const)
    if (typeof value[key] === 'number' && Number.isFinite(value[key]))
      result[key] = Math.max(0, Math.min(1, value[key]!));
  return result;
}
let context: AudioContext | undefined;
const buffers = new Map<string, AudioBuffer>();
let variation = 0;
export function unlockAudio() {
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
  } catch {
    /* Silent fallback on browsers without audio. */
  }
}
const aliases = {
  diceRoll: 'dice',
  diceLand: 'land',
  pieceLift: 'lift',
  pieceHop: 'hop',
  pieceLand: 'land',
  knockImpact: 'knock',
  knockReturn: 'return',
  homeGateLock: 'shield',
  homeUnlock: 'home',
  homeEntry: 'entry',
  pieceSecured: 'home',
  victory: 'win',
  halkiActivation: 'halki',
  supportReady: 'home',
  reinforcement: 'knock',
  shieldBreak: 'shield',
  teamShield: 'shield',
  reaction: 'ui',
  turnStart: 'turn',
  halkiHop: 'reverse',
  halkiKill: 'knock',
  halkiDeath: 'knock',
  multiCapture: 'knock',
} as const;
export type SoundKind = Recipe | keyof typeof aliases;
export function playSound(kind: SoundKind, prefs: Preferences) {
  if (prefs.mute || !context || context.state !== 'running') return;
  const audio = context,
    volume = prefs.master * prefs.sfx * 0.7;
  if (volume <= 0) return;
  const recipe =
    kind in aliases ? aliases[kind as keyof typeof aliases] : (kind as Recipe);
  const variant = variation++ % 4;
  for (const [index, note] of soundRecipes[recipe].entries()) {
    const v = (variant + index) % 4,
      key = note.material + ':' + v;
    let buffer = buffers.get(key);
    if (!buffer) {
      const data = renderMaterial(note.material, audio.sampleRate, v);
      buffer = audio.createBuffer(1, data.length, audio.sampleRate);
      buffer.copyToChannel(data, 0);
      buffers.set(key, buffer);
    }
    const source = audio.createBufferSource(),
      gain = audio.createGain();
    source.buffer = buffer;
    source.playbackRate.value = (note.pitch ?? 1) * (1 + (v - 1.5) * 0.007);
    gain.gain.value = volume * note.gain;
    source.connect(gain);
    gain.connect(audio.destination);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(audio.currentTime + note.at);
  }
}
export function haptic(prefs: Preferences) {
  if (
    prefs.haptics &&
    typeof navigator !== 'undefined' &&
    'vibrate' in navigator
  )
    navigator.vibrate(12);
}

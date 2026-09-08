import { expect, it, vi, afterEach } from 'vitest';
import { normalizePreferences, defaults } from '../lib/sound';
import {
  renderMaterial,
  soundRecipes,
  type Material,
} from '../lib/audio-design';
import { NORMAL_STEP_MS, REDUCED_STEP_MS, hopDuration } from '../shared/motion';
import { stackPresentation } from '../shared/stack-presentation';
afterEach(() => vi.unstubAllGlobals());
it('OS reduction seeds only the initial preference; explicit OFF and ON both win', () => {
  expect(normalizePreferences({}, true).reduced).toBe(true);
  expect(normalizePreferences({ reduced: false }, true).reduced).toBe(false);
  expect(normalizePreferences({ reduced: true }, false).reduced).toBe(true);
  const saved = JSON.parse(
    JSON.stringify(normalizePreferences({ reduced: false }, true)),
  );
  expect(normalizePreferences(saved, true).reduced).toBe(false);
});
it('all six steps share a readable pace and a 900ms journey', () => {
  expect(NORMAL_STEP_MS).toBe(150);
  expect(
    Array.from({ length: 6 }, (_, i) => hopDuration(i, 6)).reduce(
      (a, b) => a + b,
    ),
  ).toBe(900);
  expect(REDUCED_STEP_MS * 6).toBeLessThan(300);
});
it.each([2, 3, 4])(
  'keeps the exact moving token above a %i-piece stack despite a new active player',
  (count) => {
    const pieces = Array.from({ length: count }, (_, n) => ({
      id: `p${n}`,
      seat: 0 as const,
      number: n,
      position: { kind: 'TRACK' as const, index: 6, travelled: 4 },
    }));
    const layout = stackPresentation(pieces, ['p0'], 1, [], [`p${count - 1}`]);
    expect(layout.find((p) => p.piece.id === `p${count - 1}`)?.top).toBe(true);
  },
);
it.each(['wood', 'plastic', 'felt', 'knock', 'chime', 'swell'] as Material[])(
  '%s has four original bounded, distinct, smoothly ended material buffers',
  (material) => {
    const buffers = [0, 1, 2, 3].map((v) => renderMaterial(material, 24000, v));
    for (const data of buffers) {
      expect(data.length / 24000).toBeLessThanOrEqual(0.6);
      expect(Math.max(...data.map(Math.abs))).toBeCloseTo(0.8, 5);
      expect(Math.abs(data[0])).toBe(0);
      expect(Math.abs(data.at(-1)!)).toBeLessThan(0.005);
    }
    expect(buffers[0]).not.toEqual(buffers[1]);
    expect(buffers[1]).not.toEqual(buffers[2]);
    expect(buffers[2]).not.toEqual(buffers[3]);
  },
);
it('keeps the landing stack unchanged until the moving token has arrived', () => {
  const pieces = [0, 1, 2].map((number) => ({
    id: `p${number}`,
    number,
    seat: 0 as const,
    position: { kind: 'TRACK' as const, index: 6, travelled: 4 },
  }));
  const inFlight = stackPresentation(pieces, [], 0, [], ['p2']);
  expect(inFlight.find((p) => p.piece.id === 'p0')!.count).toBe(2);
  expect(inFlight.find((p) => p.piece.id === 'p2')!.count).toBe(1);
  const landed = stackPresentation(pieces, [], 0);
  expect(landed.every((p) => p.count === 3)).toBe(true);
});
it('mixes movement below landing, capture and victory and limits the dice rattle', () => {
  expect(soundRecipes.hop[0].gain).toBeLessThan(soundRecipes.land[0].gain);
  expect(soundRecipes.land[0].gain).toBeLessThan(soundRecipes.knock[0].gain);
  expect(soundRecipes.ui[0].gain).toBeLessThan(soundRecipes.hop[0].gain);
  expect(soundRecipes.dice).toHaveLength(6);
  expect(soundRecipes.dice.at(-1)!.at).toBeLessThan(0.6);
});
it('schedules fixed-rate buffers, applies both volume controls, reuses samples and releases nodes', async () => {
  vi.resetModules();
  const sources: {
    playbackRate: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    onended?: () => void;
  }[] = [];
  const gains: {
    gain: { value: number };
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const createBuffer = vi.fn((_channels, length) => ({
    copyToChannel: vi.fn(),
    length,
  }));
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      sampleRate = 24000;
      currentTime = 1;
      destination = {};
      resume = vi.fn().mockResolvedValue(undefined);
      createBuffer = createBuffer;
      createBufferSource() {
        const s = {
          playbackRate: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: vi.fn(),
        };
        sources.push(s);
        return s;
      }
      createGain() {
        const g = { gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() };
        gains.push(g);
        return g;
      }
    },
  );
  const sound = await import('../lib/sound');
  sound.unlockAudio();
  for (let i = 0; i < 5; i++)
    sound.playSound('pieceHop', { ...defaults, master: 0.5, sfx: 0.4 });
  expect(createBuffer).toHaveBeenCalledTimes(4);
  expect(sources).toHaveLength(5);
  expect(gains[0].gain.value).toBeCloseTo(0.5 * 0.4 * 0.7 * 0.14);
  for (const [i, s] of sources.entries()) {
    expect(s.playbackRate.value).toBeGreaterThan(0.98);
    expect(s.playbackRate.value).toBeLessThan(1.02);
    s.onended!();
    expect(s.disconnect).toHaveBeenCalledOnce();
    expect(gains[i].disconnect).toHaveBeenCalledOnce();
  }
});

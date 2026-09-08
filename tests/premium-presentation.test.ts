import { it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Board } from '../components/game/Board';
import { BoardSelector } from '../components/game/Cosmetics';
import { createMatch, type GameEvent } from '../shared/game';
import { capturePresentation } from '../shared/presentation-events';
import { publicCosmetics } from '../shared/cosmetics';
import { defaults, normalizePreferences } from '../lib/sound';
import type { Seat } from '../shared/topology';

afterEach(() => vi.unstubAllGlobals());
it('migrates old preferences to Premium without losing audio or reduced-motion choices', () => {
  expect(
    normalizePreferences({ mute: true, sfx: 0.25, reduced: true }),
  ).toMatchObject({
    boardTheme: 'premium',
    avatar: 'movo',
    banner: 'classic',
    mute: true,
    sfx: 0.25,
    reduced: true,
  });
  expect(
    normalizePreferences({
      boardTheme: 'classic',
      avatar: 'kite',
      banner: 'gold',
      master: 99,
      sfx: Number.NaN,
    }),
  ).toMatchObject({
    boardTheme: 'classic',
    avatar: 'kite',
    banner: 'gold',
    master: 1,
    sfx: 0.5,
  });
});
it('projects only allowlisted public cosmetic IDs', () => {
  expect(
    publicCosmetics({
      avatar: 'moon',
      banner: 'tide',
      email: 'private@example.com',
      password: 'secret',
    } as object),
  ).toEqual({ avatar: 'moon', banner: 'tide' });
  expect(publicCosmetics({ avatar: '<script>', banner: 'unknown' })).toEqual({
    avatar: 'movo',
    banner: 'classic',
  });
});
it('both boards render the same 52 track IDs and piece positions without changing the match', () => {
  const match = createMatch(
    'themes',
    [0, 1, 2, 3].map((seat) => ({
      id: `p${seat}`,
      name: `Player ${seat}`,
      seat: seat as Seat,
    })),
    0,
    0,
    'REVENGE',
  );
  const before = structuredClone(match);
  const html = ['classic', 'premium'].map((theme) =>
    renderToStaticMarkup(
      createElement(Board, {
        theme: theme as 'classic' | 'premium',
        pieces: match.pieces,
        active: 0,
      }),
    ),
  );
  const cells = (markup: string) =>
    [...markup.matchAll(/data-square="([^"]+)"/g)].map((m) => m[1]);
  expect(cells(html[0])).toHaveLength(52);
  expect(cells(html[0])).toEqual(cells(html[1]));
  expect(html[0]).toContain('board-classic');
  expect(html[1]).toContain('board-premium');
  expect(match).toEqual(before);
});
it('a shared square renders one complete token above thin colored layers', () => {
  const pieces = [0, 1, 2, 3].map((seat) => ({
    id: `p${seat}`,
    seat: seat as Seat,
    number: 0,
    position: { kind: 'TRACK' as const, index: 6, travelled: 5 },
  }));
  const html = renderToStaticMarkup(
    createElement(Board, {
      theme: 'premium',
      pieces,
      legal: ['p2'],
      active: 2,
      numbered: ['p2'],
    }),
  );
  expect(html.match(/class="stack-layer"/g)).toHaveLength(3);
  expect(html.match(/class="piece-number"/g)).toHaveLength(1);
  expect(html).toContain('piece 1, move available');
});
it('the board selector exposes both names and the selected preference', () => {
  const html = renderToStaticMarkup(
    createElement(BoardSelector, { value: 'classic', onChange: () => {} }),
  );
  expect(html).toContain('MOVO CLASSIC');
  expect(html).toContain('MOVO PREMIUM');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});
it('capture batches deduplicate victims and keep two or four returns within one short effect', () => {
  const events: GameEvent[] = [0, 1, 2, 3, 0].map((n) => ({
    type: 'PIECE_KNOCKED',
    playerId: 'attacker',
    pieceId: `victim${n}`,
    from: { kind: 'TRACK', index: 6, travelled: 4 },
  }));
  const batch = capturePresentation(events);
  expect(batch.victims).toHaveLength(4);
  expect(batch.halki).toBe(false);
  expect(batch.duration).toBeLessThanOrEqual(1000);
  expect(
    capturePresentation([
      { type: 'HALKI_ACTIVATED', playerId: 'attacker' },
      ...events,
    ]).halki,
  ).toBe(true);
});
it('audio waits for a user unlock and creates no nodes while muted or at zero volume', async () => {
  vi.resetModules();
  const nodes = vi.fn(),
    resume = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    'AudioContext',
    class {
      state = 'running';
      resume = resume;
      createOscillator = nodes;
    },
  );
  const sound = await import('../lib/sound');
  sound.playSound('diceRoll', defaults);
  expect(resume).not.toHaveBeenCalled();
  sound.unlockAudio();
  sound.playSound('victory', { ...defaults, mute: true });
  sound.playSound('halkiKill', { ...defaults, master: 0 });
  sound.playSound('pieceHop', { ...defaults, sfx: 0 });
  expect(resume).toHaveBeenCalledOnce();
  expect(nodes).not.toHaveBeenCalled();
});

import { afterEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { createGameService } from '../server/service';
import type { Intent, Reply, Welcome } from '../shared/protocol';
import type { Mode } from '../shared/game';
const resources: {
  service: ReturnType<typeof createGameService>;
  sockets: Socket[];
}[] = [];
afterEach(async () => {
  for (const r of resources.splice(0)) {
    for (const s of r.sockets) s.disconnect();
    await r.service.close();
  }
});
async function setup(count: number, clock?: () => number) {
  const service = createGameService({
    now: clock,
    roll: () => 6,
    autoTick: false,
  });
  const port = await service.listen(0);
  const sockets: Socket[] = [];
  resources.push({ service, sockets });
  async function connect(token?: string) {
    const socket = io(`http://127.0.0.1:${port}`, {
      auth: { v: 1, token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    const welcome = await new Promise<Welcome>((resolve, reject) => {
      socket.on('welcome', resolve);
      socket.on('connect_error', reject);
    });
    return { socket, welcome };
  }
  const players = [];
  for (let i = 0; i < count; i++) players.push(await connect());
  return { service, players, connect };
}
function send(socket: Socket, x: Partial<Intent>) {
  return new Promise<Reply>((resolve) =>
    socket.emit('intent', { v: 1, requestId: randomUUID(), ...x }, resolve),
  );
}
const config = {
  mode: 'KNOCKOUT' as const,
  name: 'Friday table',
  capacity: 4 as const,
  private: true,
  timerSeconds: 30 as const,
  spectators: true,
};
async function roomFor(
  count: number,
  clock?: () => number,
  mode: Mode = 'KNOCKOUT',
) {
  const ctx = await setup(count, clock);
  const created = await send(ctx.players[0].socket, {
    type: 'create',
    name: 'GROOT',
    settings: { ...config, mode, capacity: count as 2 | 3 | 4 },
  });
  const code = created.snapshot!.code;
  for (let i = 1; i < count; i++) {
    await send(ctx.players[i].socket, {
      type: 'join',
      code,
      name: ['GROOT', 'KIV', 'NIDA', 'NOOR'][i],
    });
    await send(ctx.players[i].socket, { type: 'ready', ready: true });
  }
  return { ...ctx, code };
}
describe('real Socket.IO rooms', () => {
  it('broadcasts guest cosmetics during play without altering the match and restores them on reconnect', async () => {
    const c = await roomFor(4, undefined, 'REVENGE');
    await send(c.players[0].socket, { type: 'start' });
    const room = c.service.rooms.get(c.code)!;
    const before = structuredClone(room.match);
    const reply = await send(c.players[0].socket, {
      type: 'profile',
      cosmetics: { avatar: 'moon', banner: 'tide' },
    });
    expect(reply.ok).toBe(true);
    expect(room.match).toEqual(before);
    const projection = c.service.projection(
      room,
      c.players[1].welcome.playerId,
    );
    expect(projection.members[0].cosmetics).toEqual({
      avatar: 'moon',
      banner: 'tide',
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /email|password|sessionToken/,
    );
    expect(
      (
        await send(c.players[0].socket, {
          type: 'profile',
          cosmetics: { avatar: 'invalid', banner: 'tide' },
        })
      ).ok,
    ).toBe(false);
    c.players[0].socket.disconnect();
    const restored = await c.connect(c.players[0].welcome.token);
    expect(restored.welcome.snapshot?.members[0].cosmetics).toEqual({
      avatar: 'moon',
      banner: 'tide',
    });
    expect(room.match).toEqual(before);
  });
  it('requires four seats for 2v2 and rejects an unavailable future mode', async () => {
    const c = await setup(1);
    expect(
      (
        await send(c.players[0].socket, {
          type: 'create',
          settings: { ...config, mode: 'KNOCKOUT_2V2', capacity: 2 },
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await send(c.players[0].socket, {
          type: 'quick',
          mode: 'FUTURE' as Mode,
        })
      ).ok,
    ).toBe(false);
    const r = await send(c.players[0].socket, {
      type: 'create',
      settings: { ...config, mode: 'KNOCKOUT_2V2' },
    });
    expect(r.ok).toBe(true);
    expect((await send(c.players[0].socket, { type: 'start' })).ok).toBe(false);
  });
  it('quick play separates modes and fills a real four-player team room', async () => {
    const c = await setup(5);
    const solo = await send(c.players[0].socket, {
      type: 'quick',
      mode: 'KNOCKOUT',
    });
    const team = await send(c.players[1].socket, {
      type: 'quick',
      mode: 'KNOCKOUT_2V2',
    });
    expect(team.snapshot!.settings.capacity).toBe(4);
    expect(team.snapshot!.code).not.toBe(solo.snapshot!.code);
    for (const p of c.players.slice(2))
      expect(
        (await send(p.socket, { type: 'quick', mode: 'KNOCKOUT_2V2' }))
          .snapshot!.code,
      ).toBe(team.snapshot!.code);
  });
  it('host randomization preserves opposite teams, resets readiness and does not permit in-match changes', async () => {
    const c = await roomFor(4, undefined, 'KNOCKOUT_2V2');
    expect((await send(c.players[1].socket, { type: 'randomize' })).ok).toBe(
      false,
    );
    const changed = await send(c.players[0].socket, { type: 'randomize' });
    expect(changed.ok).toBe(true);
    expect(new Set(changed.snapshot!.members.map((m) => m.seat)).size).toBe(4);
    expect(changed.snapshot!.members.every((m) => !m.ready)).toBe(true);
    for (const p of c.players)
      await send(p.socket, { type: 'ready', ready: true });
    const started = await send(c.players[0].socket, { type: 'start' });
    expect(started.snapshot!.match!.players.map((p) => p.team)).toEqual([
      'A',
      'B',
      'A',
      'B',
    ]);
    expect((await send(c.players[0].socket, { type: 'randomize' })).ok).toBe(
      false,
    );
  });
  it('all four clients receive the same route, knock, gate unlock and individual team state', async () => {
    const c = await roomFor(4, undefined, 'KNOCKOUT_2V2');
    await send(c.players[0].socket, { type: 'start' });
    const room = c.service.rooms.get(c.code)!,
      s = room.match!;
    s.pieces[0].position = {
      kind: 'HOME_GATE_LOCKED',
      index: 50,
      travelled: 50,
    };
    s.pieces[1].position = { kind: 'TRACK', index: 3, travelled: 3 };
    s.pieces[4].position = { kind: 'TRACK', index: 6, travelled: 6 };
    s.pieces[8].position = {
      kind: 'HOME_GATE_LOCKED',
      index: 24,
      travelled: 50,
    };
    s.dice = 3;
    const projections = c.players.map(
      (p) =>
        new Promise<Reply['snapshot']>((resolve) => {
          const receive = (snapshot: Reply['snapshot']) => {
            if (snapshot?.match?.revision === s.revision + 1) {
              p.socket.off('snapshot', receive);
              resolve(snapshot);
            }
          };
          p.socket.on('snapshot', receive);
        }),
    );
    const r = await send(c.players[0].socket, {
      type: 'move',
      pieceId: s.pieces[1].id,
      matchId: s.id,
      revision: s.revision,
    });
    expect(r.ok).toBe(true);
    for (const snapshot of await Promise.all(projections)) {
      expect(snapshot!.match).toEqual(r.snapshot!.match);
      expect(snapshot!.events[0].path).toHaveLength(3);
      expect(snapshot!.match!.pieces[0].position.kind).toBe('TRACK');
      expect(snapshot!.match!.pieces[8].position.kind).toBe('HOME_GATE_LOCKED');
    }
  });
  it('2v2 reconnect restores gate locks, legal exclusions and opposite teams without duplicate pieces', async () => {
    let clock = 1000;
    const c = await roomFor(4, () => clock, 'KNOCKOUT_2V2');
    await send(c.players[0].socket, { type: 'start' });
    const s = c.service.rooms.get(c.code)!.match!;
    s.pieces[0].position = {
      kind: 'HOME_GATE_LOCKED',
      index: 50,
      travelled: 50,
    };
    s.dice = 6;
    c.players[0].socket.disconnect();
    await new Promise((r) => setTimeout(r, 20));
    clock += 3000;
    c.service.tick();
    const restored = await c.connect(c.players[0].welcome.token);
    expect(
      restored.welcome.snapshot!.match!.players.map((p) => p.team),
    ).toEqual(['A', 'B', 'A', 'B']);
    expect(restored.welcome.snapshot!.match!.pieces).toHaveLength(16);
    expect(restored.welcome.snapshot!.match!.pieces[0].position.kind).toBe(
      'HOME_GATE_LOCKED',
    );
    expect(
      restored.welcome.snapshot!.legal.map((m) => m.pieceId),
    ).not.toContain(s.pieces[0].id);
    const illegal = await send(restored.socket, {
      type: 'move',
      pieceId: s.pieces[0].id,
      matchId: s.id,
      revision: s.revision,
    });
    expect(illegal.ok).toBe(false);
  });
  it('2v2 disconnect keeps the team intact until connected players vote to forfeit', async () => {
    let clock = 1000;
    const c = await roomFor(4, () => clock, 'KNOCKOUT_2V2');
    await send(c.players[0].socket, { type: 'start' });
    c.players[0].socket.disconnect();
    await new Promise((r) => setTimeout(r, 20));
    clock = 89999;
    c.service.tick();
    expect(c.service.rooms.get(c.code)!.match!.phase).toBe('PLAYING');
    clock = 92000;
    c.service.tick();
    const room = c.service.rooms.get(c.code)!;
    expect(room.match!.winnerTeam).toBeNull();
    await send(c.players[1].socket, {
      type: 'disconnectVoteStart',
      decisionId: room.pause!.decisions[0].id,
      targetId: c.players[0].welcome.playerId,
    });
    for (const i of [1, 2])
      await send(c.players[i].socket, {
        type: 'disconnectVote',
        vote: 'remove',
        decisionId: room.pause!.decisions[0].id,
        targetId: c.players[0].welcome.playerId,
      });
    const m = c.service.rooms.get(c.code)!.match!;
    expect(m.winnerTeam).toBe('B');
    expect(m.players.map((p) => p.team)).toEqual(['A', 'B', 'A', 'B']);
  });
  it.each([2, 3, 4])('starts and projects a %i-player match', async (count) => {
    const c = await roomFor(count);
    const r = await send(c.players[0].socket, { type: 'start' });
    expect(r.ok).toBe(true);
    expect(r.snapshot!.match!.pieces).toHaveLength(count * 4);
    expect(new Set(r.snapshot!.members.map((m) => m.seat)).size).toBe(count);
  });
  it('rejects non-host starts, unready starts and full rooms', async () => {
    const c = await setup(3);
    const r = await send(c.players[0].socket, {
      type: 'create',
      settings: { ...config, capacity: 2 },
    });
    const code = r.snapshot!.code;
    await send(c.players[1].socket, { type: 'join', code });
    expect((await send(c.players[1].socket, { type: 'start' })).ok).toBe(false);
    expect((await send(c.players[0].socket, { type: 'start' })).ok).toBe(false);
    expect(
      (await send(c.players[2].socket, { type: 'join', code })).error,
    ).toContain('full');
  });
  it('ignores forged die values, deduplicates and rejects stale moves', async () => {
    const c = await roomFor(2);
    const start = await send(c.players[0].socket, { type: 'start' });
    const m = start.snapshot!.match!;
    const request = {
      type: 'roll' as const,
      requestId: randomUUID(),
      revision: 0,
      matchId: m.id,
      roll: 1,
    };
    const r = await send(c.players[0].socket, request);
    expect(r.snapshot!.match!.dice).toBe(6);
    expect(
      (await send(c.players[0].socket, request)).snapshot!.match!.revision,
    ).toBe(1);
    expect(
      (
        await send(c.players[0].socket, {
          type: 'move',
          pieceId: m.pieces[0].id,
          revision: 0,
          matchId: m.id,
        })
      ).ok,
    ).toBe(false);
    expect(c.service.rooms.get(c.code)!.match!.revision).toBe(1);
  });
  it('rejects wrong player, forged destinations and spectator play', async () => {
    const c = await roomFor(2);
    const start = await send(c.players[0].socket, { type: 'start' });
    const m = start.snapshot!.match!;
    expect(
      (
        await send(c.players[1].socket, {
          type: 'roll',
          revision: 0,
          matchId: m.id,
        })
      ).ok,
    ).toBe(false);
    const watcher = await c.connect();
    const joined = await send(watcher.socket, {
      type: 'join',
      code: c.code,
      spectate: true,
      name: 'NOOR',
    });
    expect(joined.snapshot!.members.at(-1)!.seat).toBeNull();
    expect(joined.snapshot!.legal).toHaveLength(0);
    expect(
      (await send(watcher.socket, { type: 'roll', revision: 0, matchId: m.id }))
        .error,
    ).toContain('Spectators');
    expect(
      (await send(watcher.socket, { type: 'ready', ready: true })).ok,
    ).toBe(false);
  });
  it('reconnect restores the exact guest, pending die and pieces', async () => {
    const c = await roomFor(4);
    const start = await send(c.players[0].socket, { type: 'start' });
    const m = start.snapshot!.match!;
    const r = await send(c.players[0].socket, {
      type: 'roll',
      revision: 0,
      matchId: m.id,
    });
    const before = r.snapshot!.match;
    c.players[0].socket.disconnect();
    const back = await c.connect(c.players[0].welcome.token);
    expect(back.welcome.playerId).toBe(c.players[0].welcome.playerId);
    expect(back.welcome.snapshot!.match).toEqual(before);
    expect(back.welcome.snapshot!.members).toHaveLength(4);
  });
  it('keeps session secrets and receipt caches out of projections', async () => {
    const c = await roomFor(2);
    const room = c.service.rooms.get(c.code)!;
    const publicJson = JSON.stringify(
      c.service.projection(room, c.players[0].welcome.playerId),
    );
    expect(publicJson).not.toContain('token');
    expect(publicJson).not.toContain(c.players[0].welcome.token!);
    expect(publicJson).not.toContain('receipts');
    expect(publicJson).not.toContain('banned');
  });
  it('host transfer, kick and leave work without ghost seats', async () => {
    const c = await roomFor(3);
    const target = c.players[1].welcome.playerId;
    expect(
      (await send(c.players[0].socket, { type: 'transfer', targetId: target }))
        .snapshot!.hostId,
    ).toBe(target);
    expect(
      (
        await send(c.players[1].socket, {
          type: 'kick',
          targetId: c.players[2].welcome.playerId,
        })
      ).snapshot!.members,
    ).toHaveLength(2);
    expect(
      (await send(c.players[2].socket, { type: 'join', code: c.code })).ok,
    ).toBe(false);
    await send(c.players[1].socket, { type: 'leave' });
    expect(c.service.rooms.get(c.code)!.hostId).toBe(
      c.players[0].welcome.playerId,
    );
  });
  it('quick play joins a real public waiting room', async () => {
    const c = await setup(2);
    const a = await send(c.players[0].socket, { type: 'quick', name: 'GROOT' });
    const b = await send(c.players[1].socket, { type: 'quick', name: 'KIV' });
    expect(b.snapshot!.code).toBe(a.snapshot!.code);
    expect(b.snapshot!.members).toHaveLength(2);
  });
  it('server timeout advances; a disconnected player stays until a majority removes them', async () => {
    let time = 1000;
    const c = await roomFor(3, () => time);
    await send(c.players[0].socket, { type: 'start' });
    time = 32000;
    c.service.tick();
    expect(c.service.rooms.get(c.code)!.match!.currentPlayerId).toBe(
      c.players[1].welcome.playerId,
    );
    const disconnected = new Promise<void>((resolve) =>
      c.service.io.sockets.sockets
        .get(c.players[1].socket.id!)!
        .once('disconnect', () => resolve()),
    );
    c.players[1].socket.disconnect();
    await disconnected;
    time += 90001;
    c.service.tick();
    const room = c.service.rooms.get(c.code)!;
    expect(room.match!.players[1].forfeited).toBe(false);
    await send(c.players[0].socket, {
      type: 'disconnectVoteStart',
      decisionId: room.pause!.decisions[0].id,
      targetId: c.players[1].welcome.playerId,
    });
    for (const i of [0, 2])
      await send(c.players[i].socket, {
        type: 'disconnectVote',
        vote: 'remove',
        decisionId: room.pause!.decisions[0].id,
        targetId: c.players[1].welcome.playerId,
      });
    expect(c.service.rooms.get(c.code)!.match!.players[1].forfeited).toBe(true);
    expect(c.service.rooms.get(c.code)!.members).toHaveLength(2);
  });
  it('rematch creates a fresh board and requires readiness', async () => {
    const c = await roomFor(2);
    await send(c.players[0].socket, { type: 'start' });
    await send(c.players[1].socket, { type: 'leave' });
    const r = await send(c.players[0].socket, { type: 'rematch' });
    expect(r.snapshot!.match).toBeNull();
    expect((await send(c.players[0].socket, { type: 'start' })).ok).toBe(false);
  });
  it('rejects protocol mismatch and invalid reconnect credentials', async () => {
    const c = await setup(1);
    await expect(c.connect('invalid')).rejects.toThrow('expired');
    expect(
      (
        await send(c.players[0].socket, {
          type: 'create',
          v: 99 as 1,
          settings: config,
        })
      ).error,
    ).toContain('version');
  });
});

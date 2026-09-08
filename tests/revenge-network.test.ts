import { afterEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, existsSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createGameService } from '../server/service';
import { type Mode } from '../shared/game';
import { syncSquares } from '../shared/revenge-collision';
import type { Intent, Reply, Welcome, Snapshot } from '../shared/protocol';
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});
function send(socket: Socket, x: Partial<Intent>) {
  return new Promise<Reply>((resolve) =>
    socket.emit('intent', { v: 1, requestId: randomUUID(), ...x }, resolve),
  );
}
async function setup(database?: string) {
  let now = 1000,
    die = 6;
  const service = createGameService({
    database,
    now: () => now,
    roll: () => die,
    autoTick: false,
  });
  const port = await service.listen(0);
  const sockets: Socket[] = [];
  cleanup.push(async () => {
    sockets.forEach((s) => s.disconnect());
    await service.close();
  });
  async function connect(token?: string) {
    const socket = io(`http://127.0.0.1:${port}`, {
      auth: { v: 1, token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    const w = await new Promise<Welcome>((resolve, reject) => {
      socket.once('welcome', resolve);
      socket.once('connect_error', reject);
    });
    return { socket, w };
  }
  const players: { socket: Socket; w: Welcome }[] = [];
  for (let i = 0; i < 4; i++) players.push(await connect());
  const host = players[0];
  let r = await send(host.socket, {
    type: 'create',
    name: 'GROOT',
    settings: {
      mode: 'REVENGE',
      name: 'Revenge test',
      capacity: 4,
      private: true,
      timerSeconds: 0,
      spectators: true,
    },
  });
  const code = r.snapshot!.code;
  for (let i = 1; i < 4; i++) {
    await send(players[i].socket, {
      type: 'join',
      code,
      name: ['GROOT', 'KIV', 'NIDA', 'NOOR'][i],
    });
    await send(players[i].socket, { type: 'ready', ready: true });
  }
  r = await send(host.socket, { type: 'start' });
  expect(r.ok).toBe(true);
  const room = service.rooms.get(code)!;
  const act = (
    i: number,
    type: 'roll' | 'move' | 'declineHalki',
    extra: Partial<Intent> = {},
  ) =>
    send(players[i].socket, {
      type,
      matchId: room.match!.id,
      revision: room.match!.revision,
      ...extra,
    });
  return {
    service,
    players,
    room,
    connect,
    act,
    code,
    die: (n: number) => {
      die = n;
    },
    time: (n: number) => {
      now = n;
    },
  };
}
it.each([2, 3])(
  'server rejects Revenge capacity %i before creating room',
  async (capacity) => {
    const c = await setup();
    const guest = await c.connect();
    const r = await send(guest.socket, {
      type: 'create',
      settings: {
        mode: 'REVENGE',
        name: 'Invalid',
        capacity: capacity as 2 | 3,
        private: true,
        timerSeconds: 0,
        spectators: true,
      },
    });
    expect(r.ok).toBe(false);
  },
);
it('separates Revenge quick queues from both Knockout modes', async () => {
  const c = await setup();
  const guests = await Promise.all([c.connect(), c.connect(), c.connect()]);
  const replies = await Promise.all(
    guests.map((p, i) =>
      send(p.socket, {
        type: 'quick',
        mode: (['REVENGE', 'KNOCKOUT', 'KNOCKOUT_2V2'] as Mode[])[i],
      }),
    ),
  );
  expect(new Set(replies.map((r) => r.snapshot!.code)).size).toBe(3);
  expect(replies[0].snapshot!.settings.capacity).toBe(4);
});
it('all four sockets receive the same Home activation and rejects forged targets and bypass', async () => {
  const c = await setup(),
    s = c.room.match!,
    owner = s.players[0].id,
    victim = s.players[1].id;
  s.pieces[0].position = { kind: 'HOME' };
  for (const i of [2, 3]) {
    s.pieces[i].position = { kind: 'HOME' };
    s.pieces[i].hasUsedHalki = true;
  }
  s.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
  expect((await c.act(0, 'roll')).snapshot!.match!.revenge!.awaitingBonus).toBe(
    true,
  );
  c.die(4);
  await c.act(0, 'roll');
  expect((await c.act(0, 'move', { pieceId: s.pieces[1].id })).ok).toBe(false);
  expect(
    (
      await c.act(0, 'move', {
        pieceId: s.pieces[0].id,
        targetId: s.players[2].id,
      })
    ).ok,
  ).toBe(false);
  const revision = c.room.match!.revision + 1;
  const snapshots = c.players.map(
    (p) =>
      new Promise<Snapshot>((resolve) => {
        const handler = (v: Snapshot) => {
          if (v.match?.revision === revision) {
            p.socket.off('snapshot', handler);
            resolve(v);
          }
        };
        p.socket.on('snapshot', handler);
      }),
  );
  const requestId = randomUUID();
  const move = {
    type: 'move' as const,
    requestId,
    matchId: s.id,
    revision: c.room.match!.revision,
    pieceId: s.pieces[0].id,
    targetId: victim,
  };
  const result = await send(c.players[0].socket, move);
  expect(result.ok).toBe(true);
  const all = await Promise.all(snapshots);
  for (const v of all) {
    expect(v.match).toEqual(result.snapshot!.match);
    expect(
      v.events.some(
        (e) => e.type === 'HALKI_ACTIVATED' && e.playerId === owner,
      ),
    ).toBe(true);
    expect(v.match!.pieces[0].position).toEqual({
      kind: 'HALKI_HOME_INVASION',
      homeSeat: 1,
      index: 1,
    });
  }
  expect(
    (await send(c.players[0].socket, move)).snapshot!.match!.revision,
  ).toBe(revision);
});
it('helper roll and beneficiary movement are independently authorized', async () => {
  const c = await setup(),
    s = c.room.match!,
    id = s.players[0].id,
    beneficiary = s.players[2].id;
  for (let i = 0; i < 4; i++) s.pieces[i].position = { kind: 'HOME' };
  s.revenge!.secured = [id];
  s.revenge!.support[id] = { rotationsLeft: 0, pending: [], ready: true };
  s.revenge!.beneficiaryId = beneficiary;
  expect((await c.act(2, 'roll')).ok).toBe(false);
  const r = await c.act(0, 'roll');
  expect(r.ok).toBe(true);
  c.die(1);
  await c.act(0, 'roll');
  expect(c.service.projection(c.room, beneficiary).legal).toHaveLength(4);
  expect(c.service.projection(c.room, id).legal).toEqual([]);
  expect((await c.act(0, 'move', { pieceId: s.pieces[8].id })).ok).toBe(false);
  expect((await c.act(2, 'move', { pieceId: s.pieces[8].id })).ok).toBe(true);
  expect(
    c.room.match!.pieces.slice(0, 4).every((p) => p.position.kind === 'HOME'),
  ).toBe(true);
});
it('spectators see Revenge but cannot play, chat or react', async () => {
  const c = await setup(),
    spectator = await c.connect();
  const joined = await send(spectator.socket, {
    type: 'join',
    code: c.code,
    spectate: true,
  });
  expect(joined.ok).toBe(true);
  expect(joined.snapshot!.match!.mode).toBe('REVENGE');
  expect(joined.snapshot!.legal).toEqual([]);
  for (const type of ['roll', 'chat', 'reaction', 'declineHalki'] as const)
    expect(
      (
        await send(spectator.socket, {
          type,
          text: 'hi',
          emoji: '🔥',
          revision: c.room.match!.revision,
          matchId: c.room.match!.id,
        })
      ).ok,
    ).toBe(false);
});
it('chat is bounded text, room-scoped and separately rate limited', async () => {
  const c = await setup();
  const outsider = await c.connect();
  const own = await send(outsider.socket, {
    type: 'create',
    settings: {
      mode: 'REVENGE',
      name: 'Other room',
      capacity: 4,
      private: true,
      timerSeconds: 0,
      spectators: true,
    },
  });
  const text = '<img src=x onerror=alert(1)> & hello';
  const sent = await send(c.players[0].socket, {
    type: 'chat',
    text,
    code: own.snapshot!.code,
  });
  expect(sent.ok).toBe(true);
  expect(sent.snapshot!.chat![0].text).toBe(text);
  expect(
    c.service.projection(
      c.service.rooms.get(own.snapshot!.code)!,
      outsider.w.playerId,
    ).chat,
  ).toEqual([]);
  expect(
    (await send(c.players[0].socket, { type: 'chat', text: 'x'.repeat(241) }))
      .ok,
  ).toBe(false);
  expect(
    (await send(c.players[0].socket, { type: 'chat', text: ' ' })).ok,
  ).toBe(false);
  await send(c.players[0].socket, { type: 'chat', text: 'second' });
  await send(c.players[0].socket, { type: 'chat', text: 'third' });
  expect(
    (await send(c.players[0].socket, { type: 'chat', text: 'fourth' })).ok,
  ).toBe(false);
  c.time(7000);
  expect(
    (await send(c.players[0].socket, { type: 'chat', text: 'later' })).ok,
  ).toBe(true);
});
it('reactions use allowlist, room identity, individual budgets and expiry', async () => {
  const c = await setup();
  expect(
    (await send(c.players[0].socket, { type: 'reaction', emoji: '<script>' }))
      .ok,
  ).toBe(false);
  for (const emoji of ['🔥', '👏', '👀'])
    expect(
      (await send(c.players[0].socket, { type: 'reaction', emoji })).ok,
    ).toBe(true);
  expect(
    (await send(c.players[0].socket, { type: 'reaction', emoji: '😂' })).ok,
  ).toBe(false);
  expect(
    (await send(c.players[1].socket, { type: 'reaction', emoji: '😈' })).ok,
  ).toBe(true);
  expect(
    c.service.projection(c.room, c.players[0].w.playerId).reactions,
  ).toHaveLength(2);
  c.time(5000);
  expect(
    c.service.projection(c.room, c.players[0].w.playerId).reactions,
  ).toEqual([]);
});
it('social actions stay unavailable in Knockout', async () => {
  const c = await setup();
  c.room.settings.mode = 'KNOCKOUT_2V2';
  expect(
    (await send(c.players[0].socket, { type: 'chat', text: 'no' })).ok,
  ).toBe(false);
  expect(
    (await send(c.players[0].socket, { type: 'reaction', emoji: '🔥' })).ok,
  ).toBe(false);
  expect(
    c.service.projection(c.room, c.players[0].w.playerId).chat,
  ).toBeUndefined();
});
it('restart restores Halki lifetime/targets, gates, shields, support, pending dice and identity without persisting chat', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'movo-revenge-')),
    database = join(dir, 'state.sqlite');
  const c = await setup(database),
    s = c.room.match!,
    owner = s.players[0].id;
  for (let i = 8; i < 12; i++) s.pieces[i].position = { kind: 'HOME' };
  s.pieces[0].position = { kind: 'HOME' };
  s.pieces[1].position = { kind: 'HALKI_HOME_INVASION', homeSeat: 1, index: 3 };
  s.pieces[1].hasUsedHalki = true;
  s.pieces[1].halkiInvadedHomeOwnerId = s.players[1].id;
  s.players[0].homeUnlocked = true;
  s.players[0].knocked = 1;
  s.pieces[3].hasUsedHalki = true;
  s.pieces[3].halkiInvadedHomeOwnerId = s.players[3].id;
  s.pieces[6].position = {
    kind: 'HALKI_TRACK',
    homeSeat: 2,
    index: 20,
    travelled: 4,
  };
  s.pieces[6].hasUsedHalki = true;
  s.pieces[6].halkiInvadedHomeOwnerId = s.players[2].id;
  s.players[1].homeUnlocked = true;
  s.players[1].knocked = 1;
  // The locked gate belongs to a different, still zero-knock owner.
  s.pieces[13].position = {
    kind: 'HOME_GATE_LOCKED',
    index: 37,
    travelled: 50,
  };
  for (const i of [4, 12, 2])
    s.pieces[i].position = { kind: 'TRACK', index: 6, travelled: 10 };
  s.pieces[4].position = {
    kind: 'HALKI_TRACK',
    homeSeat: 0,
    index: 6,
    travelled: 44,
  };
  s.pieces[4].hasUsedHalki = true;
  s.pieces[4].halkiInvadedHomeOwnerId = s.players[0].id;
  const completed = s.players[2].id;
  s.revenge!.secured = [completed];
  s.revenge!.support[completed] = {
    rotationsLeft: 2,
    pending: [s.players[1].id, s.players[3].id],
    ready: false,
  };
  syncSquares(s);
  await send(c.players[0].socket, { type: 'chat', text: 'ephemeral' });
  await c.act(0, 'roll');
  const expected = structuredClone(c.room.match);
  const token = c.players[0].w.token!;
  const close = cleanup.shift()!;
  await close();
  const restored = createGameService({
    database,
    autoTick: false,
    now: () => 1100,
  });
  const port = await restored.listen(0);
  const socket = io(`http://127.0.0.1:${port}`, {
    auth: { v: 1, token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  try {
    const w = await new Promise<Welcome>((resolve, reject) => {
      socket.once('welcome', resolve);
      socket.once('connect_error', reject);
    });
    expect(w.playerId).toBe(owner);
    expect(w.snapshot!.match).toEqual(expected);
    // The real six remains in the pool while its bonus is still to be rolled.
    expect(w.snapshot!.match!.revenge!.rollPending).toBe(true);
    expect(w.snapshot!.match!.revenge!.turnDice).toMatchObject([
      { value: 6, status: 'available' },
    ]);
    expect(w.snapshot!.match!.dice).toBeNull();
    expect(w.snapshot!.match!.revenge!.shields).toContainEqual({
      index: 6,
      teams: ['B'],
      halkiTeams: ['B'],
    });
    expect(w.snapshot!.match!.pieces[13].position.kind).toBe(
      'HOME_GATE_LOCKED',
    );
    expect(w.snapshot!.match!.pieces[3].hasUsedHalki).toBe(true);
    expect(w.snapshot!.match!.pieces[6].halkiInvadedHomeOwnerId).toBe(
      s.players[2].id,
    );
    expect(w.snapshot!.chat).toEqual([]);
    expect(new Set(w.snapshot!.match!.pieces.map((p) => p.id)).size).toBe(16);
  } finally {
    socket.disconnect();
    await restored.close();
    for (const p of [database, `${database}-wal`, `${database}-shm`])
      if (existsSync(p)) rmSync(p);
    rmdirSync(dir);
  }
});
it('reconnect on a helper turn preserves movement rights', async () => {
  const c = await setup(),
    s = c.room.match!,
    owner = s.players[0].id,
    beneficiary = s.players[2].id;
  for (let i = 0; i < 4; i++) s.pieces[i].position = { kind: 'HOME' };
  s.revenge!.secured = [owner];
  s.revenge!.support[owner] = { rotationsLeft: 0, pending: [], ready: true };
  s.revenge!.beneficiaryId = beneficiary;
  await c.act(0, 'roll');
  c.die(1);
  await c.act(0, 'roll');
  const rejoined = await c.connect(c.players[2].w.token);
  expect(rejoined.w.snapshot!.legal).toHaveLength(4);
  expect(rejoined.w.snapshot!.match!.currentPlayerId).toBe(owner);
  expect(rejoined.w.snapshot!.match!.revenge!.beneficiaryId).toBe(beneficiary);
});
it.each([2, 3])(
  'server authorizes optional/required Halki at %i finished pieces',
  async (finished) => {
    const c = await setup(),
      s = c.room.match!;
    for (let i = 0; i < finished; i++) s.pieces[i].position = { kind: 'HOME' };
    s.pieces[3].position = { kind: 'TRACK', index: 1, travelled: 1 };
    s.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
    await c.act(0, 'roll');
    c.die(4);
    await c.act(0, 'roll');
    expect(c.room.match!.revenge!.halkiChoice?.required).toBe(finished === 3);
    expect((await c.act(1, 'declineHalki')).ok).toBe(false);
    const before = structuredClone(c.room.match!);
    const declined = await c.act(0, 'declineHalki');
    expect(declined.ok).toBe(finished === 2);
    if (finished === 2) {
      expect(c.room.match!.pieces).toEqual(before.pieces);
      expect(c.room.match!.revenge!.turnDice.map((d) => d.status)).toEqual([
        'available',
        'available',
      ]);
    } else expect(c.room.match).toEqual(before);
  },
);
it('server rejects forged/reused dice and restores consumption on reconnect', async () => {
  const c = await setup();
  await c.act(0, 'roll');
  await c.act(0, 'roll');
  c.die(4);
  await c.act(0, 'roll');
  const s = c.room.match!,
    pieceId = s.pieces[0].id,
    dieId = s.revenge!.turnDice[0].id;
  expect((await c.act(0, 'move', { pieceId, dieId: 'forged' })).ok).toBe(false);
  expect((await c.act(0, 'move', { pieceId, dieId })).ok).toBe(true);
  expect((await c.act(0, 'move', { pieceId, dieId })).ok).toBe(false);
  const rejoined = await c.connect(c.players[0].w.token);
  expect(
    rejoined.w.snapshot!.match!.revenge!.turnDice.map((d) => d.status),
  ).toEqual(['used', 'available', 'available']);
  expect(
    rejoined.w.snapshot!.match!.revenge!.turnDice.map((d) => d.bonusOf),
  ).toEqual([null, '1:0', '1:1']);
});

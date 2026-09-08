import { afterEach, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createGameService } from '../server/service';
import type { Intent, Reply, Welcome } from '../shared/protocol';
import type { Mode } from '../shared/game';
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});
async function setup(mode: Mode = 'REVENGE', database = ':memory:') {
  let now = 1000;
  const service = createGameService({
    now: () => now,
    autoTick: false,
    roll: () => 6,
    database,
  });
  const port = await service.listen(0);
  const sockets: Socket[] = [];
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    sockets.forEach((s) => s.disconnect());
    await service.close();
  };
  cleanup.push(close);
  async function connect(token?: string) {
    const socket = io(`http://localhost:${port}`, {
      auth: { v: 1, token },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    const welcome = await new Promise<Welcome>((done) =>
      socket.once('welcome', done),
    );
    return { socket, welcome };
  }
  const players: { socket: Socket; welcome: Welcome }[] = [];
  for (let i = 0; i < 4; i++) players.push(await connect());
  const send = (i: number, input: Partial<Intent>) =>
    new Promise<Reply>((done) =>
      players[i].socket.emit(
        'intent',
        { v: 1, requestId: randomUUID(), ...input },
        done,
      ),
    );
  const made = await send(0, {
    type: 'create',
    name: 'GROOT',
    settings: {
      mode,
      name: 'Pause tests',
      capacity: 4,
      private: true,
      spectators: true,
      timerSeconds: 45,
    },
  });
  const room = service.rooms.get(made.snapshot!.code)!;
  for (let i = 1; i < 4; i++) {
    await send(i, {
      type: 'join',
      code: room.code,
      name: ['GROOT', 'KIV', 'NIDA', 'NOOR'][i],
    });
    await send(i, { type: 'ready', ready: true });
  }
  await send(0, { type: 'start' });
  const disconnect = async (i: number) => {
    const ended = new Promise<void>((done) =>
      service.io.sockets.sockets
        .get(players[i].socket.id!)!
        .once('disconnect', () => done()),
    );
    players[i].socket.disconnect();
    await ended;
  };
  const back = async (i: number) => {
    const p = await connect(players[i].welcome.token);
    players[i].socket = p.socket;
    return p;
  };
  const at = (time: number, tick = true) => {
    now = time;
    if (tick) service.tick();
  };
  const decision = (
    i: number,
    type: Intent['type'],
    vote?: 'remove' | 'wait',
    overrides: Partial<Intent> = {},
  ) =>
    send(i, {
      type,
      decisionId: room.pause?.decisions[0]?.id,
      targetId: room.pause?.decisions[0]?.playerId,
      vote,
      ...overrides,
    });
  return {
    service,
    room,
    players,
    connect,
    send,
    disconnect,
    back,
    at,
    decision,
    close,
  };
}
it.each([5000, 24000])(
  'reconnect after %i ms preserves the turn without pausing or voting',
  async (elapsed) => {
    const c = await setup();
    const before = structuredClone(c.room.match);
    await c.disconnect(1);
    c.at(1000 + elapsed);
    expect(c.room.pause).toBeFalsy();
    await c.back(1);
    expect(c.room.pause).toBeFalsy();
    expect(c.room.match).toEqual(before);
  },
);
it('pauses at exactly 25 seconds, freezes remaining turn time, then restores it after welcome + 3/2/1', async () => {
  const c = await setup();
  c.at(11000);
  await c.disconnect(1);
  c.at(35999);
  expect(c.room.pause).toBeFalsy();
  c.at(36000);
  expect(c.room.pause?.remainingMs).toBe(10000);
  const frozen = structuredClone(c.room.match);
  c.at(120000);
  expect(c.room.match).toEqual(frozen);
  await c.back(1);
  expect(c.room.pause?.resumeAt).toBe(124000);
  expect(c.room.pause?.decisions).toEqual([]);
  c.at(123999);
  expect(c.room.pause).toBeTruthy();
  c.at(124000);
  expect(c.room.pause).toBeNull();
  expect(c.room.match!.deadline).toBe(134000);
  expect(c.room.match!.turnNumber).toBe(frozen!.turnNumber);
});
it('enforces the pause threshold on incoming actions even between server ticks', async () => {
  const c = await setup();
  await c.disconnect(1);
  c.at(26000, false);
  const result = await c.send(0, {
    type: 'roll',
    matchId: c.room.match!.id,
    revision: c.room.match!.revision,
  });
  expect(result.ok).toBe(false);
  expect(result.error).toContain('paused');
  expect(c.room.match!.lastRoll).toBeNull();
});
it.each(['roll', 'move', 'declineHalki'] as const)(
  'rejects %s while paused without modifying pieces, dice or turn',
  async (type) => {
    const c = await setup();
    await c.disconnect(1);
    c.at(26000);
    const before = structuredClone(c.room.match);
    const reply = await c.send(0, {
      type,
      matchId: before!.id,
      revision: before!.revision,
      pieceId: before!.pieces[0].id,
    });
    expect(reply.error).toContain('paused');
    expect(c.room.match).toEqual(before);
    expect(
      c.service.projection(c.room, c.players[0].welcome.playerId).legal,
    ).toEqual([]);
  },
);
it('WAIT preserves the participant at 90 seconds and requests another decision', async () => {
  const c = await setup();
  await c.disconnect(1);
  c.at(26000);
  expect((await c.decision(0, 'disconnectWait')).ok).toBe(true);
  expect(c.room.pause!.decisions[0].phase).toBe('waiting');
  c.at(91000);
  expect(c.room.pause!.decisions[0].phase).toBe('decision');
  expect(c.room.pause!.decisions[0].round).toBe(2);
  expect(c.room.members).toHaveLength(4);
  expect(c.room.match!.players[1].forfeited).toBe(false);
  await c.decision(0, 'disconnectWait');
  c.at(181000);
  expect(c.room.pause!.decisions[0].phase).toBe('decision');
});
it.each(['KNOCKOUT', 'KNOCKOUT_2V2', 'REVENGE'] as const)(
  '%s applies the existing forfeit outcome only after a strict majority votes REMOVE',
  async (mode) => {
    const c = await setup(mode);
    await c.disconnect(1);
    c.at(26000);
    await c.decision(0, 'disconnectVoteStart');
    expect(c.room.pause!.decisions[0].votes).toEqual({});
    await c.decision(0, 'disconnectVote', 'remove');
    expect(c.room.members).toHaveLength(4);
    await c.decision(2, 'disconnectVote', 'remove');
    expect(c.room.members).toHaveLength(3);
    expect(c.room.match!.players[1].forfeited).toBe(true);
    if (mode === 'KNOCKOUT') {
      expect(c.room.match!.phase).toBe('PLAYING');
      expect(c.room.pause?.resumeAt).toBe(30000);
    } else {
      expect(c.room.match!.phase).toBe('FINISHED');
      expect(c.room.match!.winnerTeam).toBe('A');
      expect(c.room.match!.winReason).toBe('FORFEIT');
      expect(c.room.pause).toBeNull();
    }
  },
);
it('removing the current solo player resumes the engine-created next turn with its full timer', async () => {
  const c = await setup('KNOCKOUT');
  await c.disconnect(0);
  c.at(26000);
  await c.decision(1, 'disconnectVoteStart');
  await c.decision(1, 'disconnectVote', 'remove');
  await c.decision(2, 'disconnectVote', 'remove');
  expect(c.room.match!.currentPlayerId).toBe(c.players[1].welcome.playerId);
  expect(c.room.pause?.remainingMs).toBe(45000);
  c.at(30000);
  expect(c.room.match!.deadline).toBe(75000);
});
it('two eligible voters tied one-to-one keep waiting', async () => {
  const c = await setup();
  await c.disconnect(1);
  await c.disconnect(3);
  c.at(26000);
  await c.decision(0, 'disconnectVoteStart');
  await c.decision(0, 'disconnectVote', 'remove');
  await c.decision(2, 'disconnectVote', 'wait');
  expect(c.room.pause!.decisions[0].phase).toBe('waiting');
  expect(c.room.members).toHaveLength(4);
});
it('majority NO and unanswered vote expiry both resolve to WAIT', async () => {
  const c = await setup();
  await c.disconnect(1);
  c.at(26000);
  await c.decision(0, 'disconnectVoteStart');
  await c.decision(0, 'disconnectVote', 'wait');
  await c.decision(2, 'disconnectVote', 'wait');
  expect(c.room.pause!.decisions[0].phase).toBe('waiting');
  await c.decision(0, 'disconnectVoteStart');
  c.at(56000);
  expect(c.room.pause!.decisions[0].phase).toBe('waiting');
  expect(c.room.members).toHaveLength(4);
});
it('a sole eligible player must explicitly vote YES; starting a vote is not consent', async () => {
  const c = await setup('KNOCKOUT');
  for (const i of [1, 2, 3]) await c.disconnect(i);
  c.at(26000);
  await c.decision(0, 'disconnectVoteStart');
  expect(c.room.members).toHaveLength(4);
  await c.decision(0, 'disconnectVote', 'remove');
  expect(c.room.members).toHaveLength(3);
  expect(c.room.pause!.decisions[0].playerId).toBe(
    c.players[2].welcome.playerId,
  );
});
it('reconnecting during a vote cancels it, rejects its old ballot and resumes once', async () => {
  const c = await setup();
  await c.disconnect(1);
  c.at(26000);
  await c.decision(0, 'disconnectVoteStart');
  const d = structuredClone(c.room.pause!.decisions[0]);
  await c.decision(0, 'disconnectVote', 'remove');
  await c.back(1);
  expect(c.room.pause!.decisions).toEqual([]);
  expect(c.room.pause!.returnedIds).toContain(c.players[1].welcome.playerId);
  expect(
    (
      await c.decision(2, 'disconnectVote', 'remove', {
        decisionId: d.id,
        targetId: d.playerId,
      })
    ).ok,
  ).toBe(false);
  c.at(30000);
  const revision = c.room.match!.revision;
  c.at(31000);
  expect(c.room.match!.revision).toBe(revision);
});
it('ignores votes from disconnected players and recalculates eligible voters', async () => {
  const c = await setup();
  await c.disconnect(1);
  c.at(26000);
  await c.decision(0, 'disconnectVoteStart');
  await c.decision(2, 'disconnectVote', 'remove');
  await c.disconnect(2);
  expect(c.room.pause!.decisions[0].votes).toEqual({});
  await c.decision(0, 'disconnectVote', 'remove');
  expect(c.room.members).toHaveLength(4);
  await c.decision(3, 'disconnectVote', 'remove');
  expect(c.room.match!.winReason).toBe('FORFEIT');
});
it('queues multiple absent players and cannot resume while another is still missing', async () => {
  const c = await setup();
  await c.disconnect(1);
  c.at(11000);
  await c.disconnect(3);
  c.at(36000);
  expect(c.room.pause!.decisions.map((d) => d.playerId)).toEqual([
    c.players[1].welcome.playerId,
    c.players[3].welcome.playerId,
  ]);
  const later = c.room.pause!.decisions[1];
  expect(
    (
      await c.decision(0, 'disconnectWait', undefined, {
        decisionId: later.id,
        targetId: later.playerId,
      })
    ).ok,
  ).toBe(false);
  await c.back(1);
  expect(c.room.pause!.resumeAt).toBeNull();
  expect(c.room.pause!.decisions[0].playerId).toBe(
    c.players[3].welcome.playerId,
  );
  await c.back(3);
  expect(c.room.pause!.resumeAt).toBe(40000);
  await c.disconnect(1);
  expect(c.room.pause!.resumeAt).toBeNull();
});
it('rejects spectator and stale ballots, deduplicates votes and keeps chat available during WAIT', async () => {
  const c = await setup();
  const spectator = await c.connect();
  c.players.push(spectator);
  await c.send(4, { type: 'join', code: c.room.code, spectate: true });
  await c.disconnect(1);
  c.at(26000);
  expect((await c.decision(4, 'disconnectVoteStart')).ok).toBe(false);
  await c.decision(0, 'disconnectVoteStart');
  const d = c.room.pause!.decisions[0];
  const ballot = {
    type: 'disconnectVote' as const,
    decisionId: d.id,
    targetId: d.playerId,
    vote: 'remove' as const,
    requestId: randomUUID(),
  };
  expect((await c.send(0, ballot)).ok).toBe(true);
  expect((await c.send(0, ballot)).ok).toBe(true);
  expect(Object.keys(d.votes)).toHaveLength(1);
  expect((await c.decision(4, 'disconnectVote', 'remove')).ok).toBe(false);
  await c.decision(2, 'disconnectVote', 'wait');
  await c.decision(3, 'disconnectVote', 'wait');
  const frozen = structuredClone(c.room.match);
  expect((await c.send(0, { type: 'chat', text: 'We can wait.' })).ok).toBe(
    true,
  );
  expect((await c.send(0, { type: 'reaction', emoji: '👏' })).ok).toBe(true);
  expect(c.room.match).toEqual(frozen);
});
it('a completely unattended room still uses the existing grace cleanup', async () => {
  const c = await setup();
  for (let i = 0; i < 4; i++) await c.disconnect(i);
  c.at(91000);
  expect(c.service.rooms.has(c.room.code)).toBe(false);
});
it('preserves a paused timer and safely clears stale ballots across a service restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'movo-pause-'));
  cleanup.unshift(() => {
    const target = resolve(directory);
    if (!target.startsWith(resolve(tmpdir()) + sep))
      throw Error('Unsafe cleanup');
    rmSync(target, { recursive: true, force: true });
  });
  const database = join(directory, 'pause.sqlite');
  const c = await setup('REVENGE', database);
  await c.disconnect(1);
  c.at(26000);
  await c.decision(0, 'disconnectVoteStart');
  await c.decision(0, 'disconnectVote', 'remove');
  c.service.persist();
  await c.close();
  const restored = createGameService({
    database,
    autoTick: false,
    now: () => 100000,
  });
  cleanup.push(() => restored.close());
  const room = restored.rooms.get(c.room.code)!;
  expect(room.pause!.remainingMs).toBe(20000);
  expect(room.pause!.decisions[0].votes).toEqual({});
  expect(room.pause!.decisions[0].phase).toBe('decision');
  expect(room.pause!.resumeAt).toBeNull();
});

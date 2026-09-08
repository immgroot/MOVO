import { it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { createGameService } from '../server/service';
import type { Welcome, Reply } from '../shared/protocol';
it.each(['KNOCKOUT', 'KNOCKOUT_2V2'] as const)(
  '%s persists credentials, mode, teams, gate locks, pending die and deduplication across restart',
  async (mode) => {
    const dir = mkdtempSync(join(tmpdir(), 'movo-persistence-')),
      database = join(dir, 'test.sqlite');
    let service = createGameService({
      database,
      autoTick: false,
      roll: () => 6,
    });
    const connections: Socket[] = [];
    async function connect(port: number, token?: string) {
      const s = io(`http://127.0.0.1:${port}`, {
        auth: { v: 1, token },
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      });
      connections.push(s);
      const w = await new Promise<Welcome>((resolve, reject) => {
        s.once('welcome', resolve);
        s.once('connect_error', reject);
      });
      return { s, w };
    }
    async function send(s: Socket, input: object) {
      return new Promise<Reply>((resolve) =>
        s.emit('intent', { v: 1, requestId: randomUUID(), ...input }, resolve),
      );
    }
    try {
      const port = await service.listen(0),
        a = await connect(port),
        b = await connect(port);
      const room = await send(a.s, {
        type: 'create',
        name: 'GROOT',
        settings: {
          mode,
          name: 'Persistence test',
          capacity: mode === 'KNOCKOUT_2V2' ? 4 : 2,
          private: true,
          timerSeconds: 0,
          spectators: false,
        },
      });
      await send(b.s, { type: 'join', code: room.snapshot!.code, name: 'KIV' });
      await send(b.s, { type: 'ready', ready: true });
      if (mode === 'KNOCKOUT_2V2')
        for (const name of ['NIDA', 'NOOR']) {
          const extra = await connect(port);
          await send(extra.s, {
            type: 'join',
            code: room.snapshot!.code,
            name,
          });
          await send(extra.s, { type: 'ready', ready: true });
        }
      const started = await send(a.s, { type: 'start' });
      const request = {
        type: 'roll',
        requestId: randomUUID(),
        revision: 0,
        matchId: started.snapshot!.match!.id,
      };
      await send(a.s, request);
      const savedMatch = service.rooms.get(room.snapshot!.code)!.match!;
      savedMatch.pieces[0].position = {
        kind: 'HOME_GATE_LOCKED',
        index: 50,
        travelled: 50,
      };
      if (mode === 'KNOCKOUT_2V2') {
        savedMatch.players[2].knocked = 1;
        savedMatch.players[2].homeUnlocked = true;
        savedMatch.pieces[8].position = { kind: 'HOME' };
      }
      service.persist();
      const expected = structuredClone(savedMatch);
      a.s.disconnect();
      b.s.disconnect();
      await service.close();
      service = createGameService({ database, autoTick: false });
      const restored = await connect(await service.listen(0), a.w.token);
      expect(restored.w.playerId).toBe(a.w.playerId);
      expect(restored.w.snapshot!.match).toEqual(expected);
      expect(restored.w.snapshot!.settings.mode).toBe(mode);
      expect(restored.w.snapshot!.legal.map((m) => m.pieceId)).not.toContain(
        savedMatch.pieces[0].id,
      );
      const duplicate = await send(restored.s, request);
      expect(duplicate.ok).toBe(true);
      expect(duplicate.snapshot!.match!.revision).toBe(1);
    } finally {
      for (const s of connections) s.disconnect();
      await service.close();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

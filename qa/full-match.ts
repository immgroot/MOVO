// Local-only acceptance run through the public Socket.IO protocol. No state fixtures.
// Start the QA server, run this file, join the printed code as a spectator, then
// write .data/full-match-go.json. A marker must be newer than the waiting run.
import { io, type Socket } from 'socket.io-client';
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Intent, Reply, Snapshot, Welcome } from '../shared/protocol';
const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const players: { socket: Socket; id: string; snapshot?: Snapshot | null }[] =
  [];
const resultFile = '.data/full-match-progress.json';
const newerMarker = (path: string, since: number) =>
  existsSync(path) && statSync(path).mtimeMs >= since;
async function send(socket: Socket, input: Partial<Intent>) {
  const reply = await new Promise<Reply>((resolve) =>
    socket.emit('intent', { v: 1, requestId: randomUUID(), ...input }, resolve),
  );
  if (!reply.ok) throw Error(reply.error);
  return reply.snapshot!;
}
try {
  for (let i = 0; i < 4; i++) {
    const socket = io('http://localhost:3002', {
      auth: { v: 1 },
      transports: ['websocket'],
      forceNew: true,
    });
    const welcome = await new Promise<Welcome>((resolve) =>
      socket.once('welcome', resolve),
    );
    const player = { socket, id: welcome.playerId, snapshot: welcome.snapshot };
    socket.on('snapshot', (snapshot: Snapshot) => {
      player.snapshot = snapshot;
    });
    players.push(player);
  }
  let snapshot = await send(players[0].socket, {
    type: 'create',
    name: 'AUTO GROOT',
    cosmetics: { avatar: 'kite', banner: 'gold' },
    settings: {
      mode: 'REVENGE',
      name: 'Premium full match',
      capacity: 4,
      private: true,
      spectators: true,
      timerSeconds: 0,
    },
  });
  for (let i = 1; i < 4; i++) {
    await send(players[i].socket, {
      type: 'join',
      code: snapshot.code,
      name: ['AUTO GROOT', 'AUTO KIV', 'AUTO NIDA', 'AUTO NOOR'][i],
      cosmetics: {
        avatar: ['kite', 'moon', 'lotus', 'waves'][i],
        banner: ['gold', 'grove', 'ember', 'tide'][i],
      },
    });
    await send(players[i].socket, { type: 'ready', ready: true });
  }
  writeFileSync(
    resultFile,
    JSON.stringify({
      code: snapshot.code,
      phase: 'WAITING',
      note: 'Join as spectator, then create the go marker.',
    }),
  );
  console.log(
    `Full-match room ${snapshot.code}: waiting for .data/full-match-go.json`,
  );
  const readyAt = Date.now();
  while (!newerMarker('.data/full-match-go.json', readyAt)) await pause(250);
  snapshot = await send(players[0].socket, { type: 'start' });
  let actions = 0;
  const events: Record<string, number> = {};
  while (snapshot.match!.phase === 'PLAYING' && actions < 15000) {
    // Stay below the same public per-socket rate limit as a human player.
    await pause(160);
    const match = snapshot.match!;
    const rolling = match.revenge!.rollPending;
    const actor = players.find(
      (p) =>
        p.id ===
        (rolling ? match.currentPlayerId : match.revenge!.beneficiaryId),
    )!;
    if (rolling)
      snapshot = await send(actor.socket, {
        type: 'roll',
        revision: match.revision,
        matchId: match.id,
      });
    else {
      const candidates = actor.snapshot!.legal.filter(
        (move) => !match.revenge!.halkiChoice || move.action === 'activate',
      );
      const ranked = [...candidates].sort((a, b) => {
        const score = (move: typeof a) => {
          const end = move.path.at(-1)!;
          return (
            (end.kind === 'HOME'
              ? 1000
              : ['HOME_LANE', 'HALKI_HOME_RETURN'].includes(end.kind)
                ? 500
                : 0) +
            move.knockIds.length * 250 +
            (match.pieces.find((p) => p.id === move.pieceId)!.position.kind ===
            'BASE'
              ? 80
              : 0) +
            (end.kind === 'TRACK' ? end.travelled : 0)
          );
        };
        return score(b) - score(a);
      });
      if (!ranked.length) throw Error('No legal move in movement phase.');
      const move = ranked[0];
      snapshot = await send(actor.socket, {
        type: 'move',
        revision: match.revision,
        matchId: match.id,
        pieceId: move.pieceId,
        dieId: move.dieId,
        targetId: move.targetId,
      });
    }
    for (const event of snapshot.events)
      events[event.type] = (events[event.type] ?? 0) + 1;
    actions++;
    if (actions % 100 === 0)
      console.log(
        `${actions} accepted actions; turn ${snapshot.match!.turnNumber}`,
      );
  }
  const final = {
    code: snapshot.code,
    phase: snapshot.match!.phase,
    actions,
    turns: snapshot.match!.turnNumber,
    winnerTeam: snapshot.match!.winnerTeam,
    winReason: snapshot.match!.winReason,
    home: snapshot
      .match!.pieces.filter((p) => p.position.kind === 'HOME')
      .map((p) => p.ownerId),
    players: snapshot.match!.players,
    events,
  };
  writeFileSync(resultFile, JSON.stringify(final, null, 2));
  console.log(JSON.stringify(final));
  if (final.phase !== 'FINISHED')
    throw Error('Acceptance match did not finish.');
  console.log(
    'Waiting for .data/full-match-rematch.json to verify same-room rematch.',
  );
  const finishedAt = Date.now();
  while (!newerMarker('.data/full-match-rematch.json', finishedAt))
    await pause(250);
  const reset = await send(players[0].socket, { type: 'rematch' });
  if (
    reset.code !== snapshot.code ||
    reset.match !== null ||
    reset.members.filter((m) => m.seat !== null).length !== 4
  )
    throw Error('Rematch did not preserve the table.');
  writeFileSync(
    resultFile,
    JSON.stringify(
      {
        ...final,
        rematch: { code: reset.code, match: reset.match, seatedPlayers: 4 },
      },
      null,
      2,
    ),
  );
  console.log('Same-room rematch verified.');
} finally {
  players.forEach((p) => p.socket.disconnect());
}

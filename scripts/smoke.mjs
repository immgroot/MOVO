import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { writeFileSync } from 'node:fs';
const origin = process.argv[2] ?? 'http://localhost:3000';
const mode = process.argv[3] ?? 'KNOCKOUT';
assert.ok(['KNOCKOUT', 'KNOCKOUT_2V2', 'REVENGE'].includes(mode));
const sockets = [];
async function connect(token) {
  const socket = io(origin, {
    auth: { v: 1, token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  sockets.push(socket);
  const welcome = await new Promise((resolve, reject) => {
    socket.once('welcome', resolve);
    socket.once('connect_error', reject);
  });
  const peer = { socket, welcome, latest: welcome.snapshot };
  socket.on('snapshot', (snapshot) => {
    peer.latest = snapshot;
  });
  return peer;
}
function send(socket, input) {
  return new Promise((resolve, reject) =>
    socket
      .timeout(5000)
      .emit(
        'intent',
        { v: 1, requestId: randomUUID(), ...input },
        (error, r) => {
          if (error) reject(error);
          else if (!r.ok) reject(new Error(r.error));
          else resolve(r);
        },
      ),
  );
}
const results = {
  mode,
  pages: [],
  clients: 4,
  actions: 0,
  reconnect: false,
  sameState: false,
};
try {
  for (const path of ['/', '/join/ABCDE', '/favicon.svg', '/og.png']) {
    const r = await fetch(origin + path);
    assert.equal(r.status, 200);
    const payload = await r.arrayBuffer();
    assert.ok(payload.byteLength > 20);
    if (path === '/') {
      const body = Buffer.from(payload).toString('utf8');
      assert.match(body, /MOVO/);
      assert.match(body, /og:image/);
    }
    results.pages.push(path);
  }
  const players = [];
  for (let i = 0; i < 4; i++) players.push(await connect());
  let r = await send(players[0].socket, {
    type: 'create',
    name: 'GROOT',
    settings: {
      mode,
      name: 'Disposable production smoke',
      capacity: 4,
      private: true,
      timerSeconds: 0,
      spectators: true,
    },
  });
  const code = r.snapshot.code;
  for (let i = 1; i < 4; i++) {
    await send(players[i].socket, {
      type: 'join',
      code,
      name: ['GROOT', 'KIV', 'NIDA', 'NOOR'][i],
    });
    await send(players[i].socket, { type: 'ready', ready: true });
  }
  r = await send(players[0].socket, { type: 'start' });
  for (let n = 0; n < 40; n++) {
    const m = r.snapshot.match,
      actor = players.find(
        (p) =>
          p.welcome.playerId ===
          (m.dice === null
            ? m.currentPlayerId
            : (m.revenge?.beneficiaryId ?? m.currentPlayerId)),
      );
    if (m.dice === null)
      r = await send(actor.socket, {
        type: 'roll',
        revision: m.revision,
        matchId: m.id,
      });
    else {
      const legal = actor.latest.legal;
      assert.ok(legal.length);
      r = await send(actor.socket, {
        type: 'move',
        pieceId: legal[0].pieceId,
        targetId: legal[0].targetId,
        dieId: legal[0].dieId,
        revision: m.revision,
        matchId: m.id,
      });
    }
    results.actions++;
  }
  const before = r.snapshot.match;
  players[0].socket.disconnect();
  const restored = await connect(players[0].welcome.token);
  assert.equal(restored.welcome.playerId, players[0].welcome.playerId);
  assert.deepEqual(restored.welcome.snapshot.match, before);
  results.reconnect = true;
  results.sameState = true;
  players[0] = restored;
  for (const p of players) await send(p.socket, { type: 'leave' });
  writeFileSync(
    mode === 'REVENGE'
      ? 'qa/production-smoke-revenge.json'
      : mode === 'KNOCKOUT_2V2'
        ? 'qa/production-smoke-2v2.json'
        : 'qa/production-smoke.json',
    JSON.stringify(results, null, 2) + '\n',
  );
  console.log(JSON.stringify(results));
} finally {
  for (const socket of sockets) socket.disconnect();
}

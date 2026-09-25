import { createServer } from 'node:http';
import { randomBytes, randomInt, randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { Server, type Socket } from 'socket.io';
import {
  PROTOCOL_VERSION,
  createMatch,
  legalMoves,
  resolveRoll,
  resolveMove,
  resolveTimeout,
  resolveForfeit,
  RuleError,
  teamForSeat,
  type Resolution,
} from '../shared/game';
import type {
  Room,
  Guest,
  Intent,
  Reply,
  Snapshot,
  RoomSettings,
} from '../shared/protocol';
import { MODES, isRevenge, isTeamMode, normalizeMode } from '../shared/modes';
import { HOME_GATES, isOuter, type Seat } from '../shared/topology';
import { REACTIONS, type ChatMessage, type Reaction } from '../shared/chat';
import { migrateRevenge } from '../shared/revenge-migration';
import { AVATARS, BANNERS, publicCosmetics } from '../shared/cosmetics';
import { declineHalki } from '../shared/revenge';
import {
  activeMembers,
  eligibleVoters,
  syncDisconnects,
  disconnectDecision,
  RECONNECT_CHECKPOINT_MS,
} from './disconnect';
interface SavedGuest extends Guest {
  tokenHash: string;
  receipts: string[];
}
interface Options {
  database?: string;
  now?: () => number;
  roll?: () => number;
  autoTick?: boolean;
  origin?: string;
  httpServer?: ReturnType<typeof createServer>;
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
function clean(value: unknown, max: number, fallback = '') {
  return typeof value === 'string'
    ? value
        .replace(/\p{Cc}/gu, '')
        .trim()
        .slice(0, max)
    : fallback;
}
const displayName = (value: unknown) => clean(value, 18, 'Guest') || 'Guest';
function fail(message: string): never {
  throw new RuleError(message);
}
function settings(input: unknown): RoomSettings {
  const x = input as Partial<RoomSettings> | undefined;
  if (
    !x ||
    ![2, 3, 4].includes(x.capacity!) ||
    ![0, 15, 30, 45].includes(x.timerSeconds!) ||
    typeof x.private !== 'boolean' ||
    typeof x.spectators !== 'boolean' ||
    (x.mode !== undefined && ![...MODES, 'REVENGE'].includes(x.mode)) ||
    (x.mode && isTeamMode(x.mode) && x.capacity !== 4)
  )
    return fail('Check the room settings and try again.');
  return {
    mode: normalizeMode(x.mode ?? 'KNOCKOUT'),
    name: clean(x.name, 32, 'The evening table') || 'The evening table',
    capacity: x.capacity!,
    private: x.private,
    timerSeconds: x.timerSeconds!,
    spectators: x.spectators,
  };
}
export function createGameService(options: Options = {}) {
  const now = options.now ?? Date.now,
    roll = options.roll ?? (() => randomInt(1, 7));
  const db = new DatabaseSync(options.database ?? ':memory:');
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS store (id TEXT PRIMARY KEY, body TEXT NOT NULL)',
  );
  const saved = db
    .prepare('SELECT body FROM store WHERE id = ?')
    .get('movo') as { body: string } | undefined;
  const rooms = new Map<string, Room>(),
    guests = new Map<string, SavedGuest>();
  // Session-only room chat. Never persisted with private game/session storage.
  const chats = new Map<string, ChatMessage[]>(),
    reactions = new Map<string, Reaction[]>(),
    socialRates = new Map<string, number[]>();
  if (saved) {
    const data = JSON.parse(saved.body) as {
      rooms: Room[];
      guests: SavedGuest[];
    };
    for (const r of data.rooms) {
      r.settings.mode = normalizeMode(r.settings.mode ?? 'KNOCKOUT');
      if (r.match && migrateRevenge(r.match)) {
        r.match.revision++;
        r.version++;
        r.events = [];
      }
      if (r.match && !isRevenge(r.match.mode) && r.match.rulesVersion !== 2) {
        const match = r.match;
        match.rulesVersion = 2;
        match.winnerTeam = null;
        for (const p of match.players) {
          p.team = match.mode === 'KNOCKOUT_2V2' ? teamForSeat(p.seat) : null;
          Reflect.deleteProperty(p, 'blocks');
        }
        for (const p of match.pieces) {
          const owner = match.players.find((o) => o.id === p.ownerId)!;
          if (
            isOuter(p.position) &&
            p.position.travelled >= 50 &&
            !owner.homeUnlocked
          )
            p.position = {
              kind: 'HOME_GATE_LOCKED',
              index: HOME_GATES[p.seat],
              travelled: 50,
            };
        }
        match.revision++;
        r.version++;
        r.events = [];
      }
      for (const m of r.members) {
        m.connected = false;
        m.disconnectedAt ??= now();
      }
      if (r.pause) {
        r.pause.resumeAt = null;
        for (const d of r.pause.decisions) {
          d.phase = 'decision';
          d.id = randomUUID();
          d.votes = {};
          d.voteClosesAt = null;
        }
      }
      rooms.set(r.code, r);
    }
    for (const g of data.guests) guests.set(g.tokenHash, g);
  }
  const live = new Map<string, Set<string>>(),
    ipRates = new Map<string, { count: number; since: number }>();
  const http =
    options.httpServer ??
    createServer((req, res) => {
      if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', protocol: PROTOCOL_VERSION }));
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
  const allowedOrigin = (origin: string | undefined) => {
    if (!origin) return true;
    if (options.origin) return origin === options.origin;
    try {
      const u = new URL(origin);
      return (
        u.protocol === 'http:' &&
        /^(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/.test(
          u.hostname,
        )
      );
    } catch {
      return false;
    }
  };
  const io = new Server(http, {
    maxHttpBufferSize: 8192,
    cors: { origin: (origin, cb) => cb(null, allowedOrigin(origin)) },
    allowRequest: (req, cb) => cb(null, allowedOrigin(req.headers.origin)),
    pingInterval: 10000,
    pingTimeout: 15000,
  });
  const persist = () =>
    db
      .prepare(
        'INSERT INTO store VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
      )
      .run(
        'movo',
        JSON.stringify({
          rooms: [...rooms.values()],
          guests: [...guests.values()],
        }),
      );
  function projection(room: Room, id: string): Snapshot {
    return {
      code: room.code,
      hostId: room.hostId,
      settings: room.settings,
      members: room.members,
      match: room.match,
      pause: room.pause ?? null,
      version: room.version,
      events: room.events,
      selfId: id,
      legal: room.match && !room.pause ? legalMoves(room.match, id) : [],
      serverNow: now(),
      ...(isRevenge(room.settings.mode)
        ? {
            chat: chats.get(room.code) ?? [],
            reactions: (reactions.get(room.code) ?? []).filter(
              (r) => now() - r.at < 3000,
            ),
          }
        : {}),
    };
  }
  function broadcast(room: Room) {
    room.updatedAt = now();
    for (const m of room.members)
      for (const sid of live.get(m.id) ?? [])
        io.to(sid).emit('snapshot', projection(room, m.id));
  }
  function mutate(room: Room, result?: Resolution) {
    if (result) {
      room.match = result.state;
      room.events = result.events;
    } else room.events = [];
    room.version++;
  }
  function transfer(room: Room) {
    if (
      !room.members.some(
        (m) => m.id === room.hostId && m.seat !== null && m.connected,
      )
    )
      room.hostId =
        room.members.find((m) => m.seat !== null && m.connected)?.id ??
        room.members.find((m) => m.seat !== null)?.id ??
        '';
  }
  function leave(guest: SavedGuest) {
    const room = rooms.get(guest.roomCode ?? '');
    if (!room) {
      guest.roomCode = null;
      return;
    }
    const previousTurn = room.match?.turnNumber;
    if (room.match?.phase === 'PLAYING')
      mutate(room, resolveForfeit(room.match, guest.id, now()));
    else mutate(room);
    room.members = room.members.filter((m) => m.id !== guest.id);
    if (
      room.pause &&
      room.match?.phase === 'PLAYING' &&
      room.match.turnNumber !== previousTurn
    )
      room.pause.remainingMs =
        room.match.deadline === null
          ? null
          : Math.max(0, room.match.deadline - now());
    syncDisconnects(room, now());
    guest.roomCode = null;
    transfer(room);
    for (const sid of live.get(guest.id) ?? [])
      io.to(sid).emit('snapshot', null);
    if (!room.members.length) {
      rooms.delete(room.code);
      chats.delete(room.code);
      reactions.delete(room.code);
    } else broadcast(room);
  }
  function attach(guest: SavedGuest, room: Room, spectate = false) {
    if (guest.roomCode && guest.roomCode !== room.code)
      fail('Leave your current room first.');
    if (room.banned.includes(guest.id))
      fail('You were removed from this room.');
    if (room.members.some((m) => m.id === guest.id)) {
      guest.roomCode = room.code;
      return;
    }
    if (room.members.length >= 20) fail('This room is full.');
    if (spectate && !room.settings.spectators)
      fail('Spectators are turned off for this room.');
    if (!spectate && room.match)
      fail(
        'This match has already started. You can join as a spectator if enabled.',
      );
    const seats: Seat[] =
      room.settings.capacity === 2
        ? [0, 2]
        : room.settings.capacity === 3
          ? [0, 1, 2]
          : [0, 1, 2, 3];
    const seat = seats.find((s) => !room.members.some((m) => m.seat === s));
    if (!spectate && seat === undefined) fail('This room is full.');
    room.members.push({
      id: guest.id,
      name: guest.name,
      cosmetics: publicCosmetics(guest.cosmetics),
      seat: spectate ? null : seat!,
      ready: room.hostId === guest.id,
      connected: true,
      disconnectedAt: null,
    });
    guest.roomCode = room.code;
    mutate(room);
    broadcast(room);
  }
  function makeRoom(guest: SavedGuest, config: RoomSettings) {
    if (guest.roomCode) fail('Leave your current room first.');
    if (rooms.size >= 500)
      fail('All tables are busy. Please try again shortly.');
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
      code = Array.from(
        { length: 5 },
        () => alphabet[randomInt(alphabet.length)],
      ).join('');
    } while (rooms.has(code));
    const room: Room = {
      code,
      hostId: guest.id,
      settings: config,
      members: [],
      match: null,
      version: 0,
      events: [],
      updatedAt: now(),
      banned: [],
    };
    rooms.set(code, room);
    attach(guest, room);
    return room;
  }
  function handle(guest: SavedGuest, input: unknown): Reply {
    const x = input as Intent;
    if (!x || x.v !== PROTOCOL_VERSION)
      fail('Update this tab to the latest MOVO version.');
    if (typeof x.requestId !== 'string' || !/^[\w-]{8,80}$/.test(x.requestId))
      fail('This request could not be verified.');
    let room = rooms.get(guest.roomCode ?? '');
    if (room && updateDisconnect(room)) {
      broadcast(room);
      persist();
    }
    if (guest.receipts.includes(x.requestId))
      return { ok: true, snapshot: room ? projection(room, guest.id) : null };
    if (x.cosmetics !== undefined) {
      if (
        !['profile', 'create', 'join', 'quick'].includes(x.type) ||
        !x.cosmetics ||
        !AVATARS.some((a) => a.id === x.cosmetics!.avatar) ||
        !BANNERS.some((b) => b.id === x.cosmetics!.banner)
      )
        fail('Choose a MOVO avatar and banner.');
    }
    if (x.type === 'profile') {
      if (x.name !== undefined && room?.match?.phase === 'PLAYING')
        fail('Change your name after the match.');
      if (x.name !== undefined) guest.name = displayName(x.name);
      if (x.cosmetics) guest.cosmetics = publicCosmetics(x.cosmetics);
      if (room) {
        room.members.find((m) => m.id === guest.id)!.name = guest.name;
        room.members.find((m) => m.id === guest.id)!.cosmetics =
          publicCosmetics(guest.cosmetics);
        mutate(room);
      }
    } else if (x.type === 'create') {
      guest.name = displayName(x.name ?? guest.name);
      if (x.cosmetics) guest.cosmetics = publicCosmetics(x.cosmetics);
      room = makeRoom(guest, settings(x.settings));
    } else if (x.type === 'join') {
      guest.name = displayName(x.name ?? guest.name);
      if (x.cosmetics) guest.cosmetics = publicCosmetics(x.cosmetics);
      room = rooms.get(clean(x.code, 5).toUpperCase());
      if (!room) fail('Room not found. Check the five-character code.');
      attach(guest, room, !!x.spectate);
    } else if (x.type === 'quick') {
      if (guest.roomCode) fail('Leave your current room first.');
      const mode = normalizeMode(x.mode ?? 'KNOCKOUT');
      if (!MODES.includes(mode as (typeof MODES)[number]))
        fail('Choose an available mode.');
      guest.name = displayName(x.name ?? guest.name);
      if (x.cosmetics) guest.cosmetics = publicCosmetics(x.cosmetics);
      room = [...rooms.values()].find(
        (r) =>
          !r.settings.private &&
          r.settings.mode === mode &&
          !r.match &&
          r.members.filter((m) => m.seat !== null).length < r.settings.capacity,
      );
      if (room) attach(guest, room);
      else
        room = makeRoom(guest, {
          mode,
          name: 'Open table',
          capacity: isTeamMode(mode) ? 4 : 2,
          private: false,
          timerSeconds: 30,
          spectators: true,
        });
    } else {
      if (!room)
        fail('Your room is no longer available. Create or join a new one.');
      const member = room.members.find((m) => m.id === guest.id);
      if (!member) fail('Join this room before playing.');
      if (
        ['disconnectWait', 'disconnectVoteStart', 'disconnectVote'].includes(
          x.type,
        )
      ) {
        disconnectDecision(room, guest.id, x, now());
        mutate(room);
        updateDisconnect(room);
      } else if (x.type === 'chat' || x.type === 'reaction') {
        if (!isRevenge(room.settings.mode) || room.match?.phase !== 'PLAYING')
          fail('Chat and reactions are available during Revenge matches.');
        if (member.seat === null || !member.connected)
          fail('Only seated players can send messages or reactions.');
        const reaction = x.type === 'reaction';
        const value = reaction ? x.emoji : x.text;
        if (
          typeof value !== 'string' ||
          (reaction
            ? !REACTIONS.includes(value as (typeof REACTIONS)[number])
            : !value.trim() || value.length > 240)
        )
          fail(
            reaction
              ? 'Choose one of the available reactions.'
              : 'Use 1–240 characters.',
          );
        const rateKey = `${guest.id}:${x.type}`,
          recent = (socialRates.get(rateKey) ?? []).filter(
            (t) => now() - t < (reaction ? 4000 : 5000),
          );
        if (recent.length >= 3)
          fail('Slow down for a moment before sending again.');
        socialRates.set(rateKey, [...recent, now()]);
        if (reaction) {
          const list = (reactions.get(room.code) ?? []).filter(
            (r) => now() - r.at < 3000 && r.playerId !== guest.id,
          );
          reactions.set(room.code, [
            ...list,
            {
              id: randomUUID(),
              playerId: guest.id,
              emoji: value as (typeof REACTIONS)[number],
              at: now(),
            },
          ]);
        } else {
          const text = clean(value, 240);
          if (!text) fail('Write a message first.');
          chats.set(
            room.code,
            [
              ...(chats.get(room.code) ?? []),
              {
                id: randomUUID(),
                playerId: guest.id,
                name: member.name,
                seat: member.seat,
                text,
                at: now(),
              },
            ].slice(-50),
          );
        }
        mutate(room);
      } else if (x.type === 'leave') {
        leave(guest);
        room = undefined;
      } else if (x.type === 'ready') {
        if (member.seat === null) fail('Spectators cannot ready up.');
        if (room.match) fail('The match has already started.');
        member.ready = !!x.ready;
        mutate(room);
      } else if (x.type === 'randomize') {
        if (room.hostId !== guest.id)
          fail('Only the host can randomize teams.');
        if (room.match || !isTeamMode(room.settings.mode))
          fail('Randomize teams in a 2v2 lobby.');
        const players = room.members.filter((m) => m.seat !== null);
        if (players.length !== 4)
          fail('Fill all four seats before randomizing teams.');
        const seats: Seat[] = [0, 1, 2, 3];
        for (let i = seats.length - 1; i > 0; i--) {
          const j = randomInt(i + 1);
          [seats[i], seats[j]] = [seats[j], seats[i]];
        }
        players.forEach((p, i) => {
          p.seat = seats[i];
          p.ready = false;
        });
        mutate(room);
      } else if (x.type === 'start') {
        if (room.hostId !== guest.id)
          fail('Only the host can start the match.');
        if (room.match) fail('The match has already started.');
        const players = room.members
          .filter((m) => m.seat !== null)
          .sort((a, b) => a.seat! - b.seat!);
        if (
          players.length !== room.settings.capacity ||
          players.some((p) => !p.ready || !p.connected)
        )
          fail('Every seat needs a connected, ready player.');
        room.match = createMatch(
          randomUUID(),
          players.map((m) => ({ id: m.id, name: m.name, seat: m.seat! })),
          room.settings.timerSeconds,
          now(),
          room.settings.mode,
        );
        mutate(room);
        room.events = [{ type: 'MATCH_STARTED', playerId: players[0].id }];
      } else if (x.type === 'kick' || x.type === 'transfer') {
        if (room.hostId !== guest.id) fail('Only the host can manage seats.');
        if (room.match?.phase === 'PLAYING')
          fail('Manage seats between matches.');
        const target = room.members.find(
          (m) => m.id === x.targetId && m.id !== guest.id,
        );
        if (!target) fail('Choose another player.');
        if (x.type === 'transfer') {
          if (target.seat === null || !target.connected)
            fail('Choose a connected player.');
          room.hostId = target.id;
          mutate(room);
        } else {
          room.banned.push(target.id);
          const other = [...guests.values()].find((g) => g.id === target.id);
          if (other) leave(other);
        }
      } else if (x.type === 'rematch') {
        if (room.hostId !== guest.id)
          fail('The host can return everyone to the lobby.');
        if (room.match?.phase !== 'FINISHED') fail('Finish this match first.');
        room.match = null;
        room.pause = null;
        chats.delete(room.code);
        reactions.delete(room.code);
        for (const m of room.members) m.ready = m.id === guest.id;
        mutate(room);
      } else if (
        x.type === 'roll' ||
        x.type === 'move' ||
        x.type === 'declineHalki'
      ) {
        if (member.seat === null) fail('Spectators can watch but cannot play.');
        if (!room.match) fail('The match has not started.');
        if (room.pause) fail('The match is paused while a player reconnects.');
        if (x.matchId !== room.match.id || x.revision !== room.match.revision)
          fail('The board has changed. Try again with the updated turn.');
        if (room.match.deadline !== null && now() >= room.match.deadline) {
          mutate(room, resolveTimeout(room.match, now()));
          broadcast(room);
          persist();
          fail('Your turn timed out.');
        }
        // Client results/destinations are ignored: the engine resolves everything.
        mutate(
          room,
          x.type === 'declineHalki'
            ? declineHalki(room.match, guest.id, now())
            : x.type === 'roll'
              ? resolveRoll(room.match, guest.id, roll(), now())
              : resolveMove(
                  room.match,
                  guest.id,
                  clean(x.pieceId, 100),
                  now(),
                  clean(x.targetId, 100),
                  clean(x.dieId, 100) || undefined,
                ),
        );
      } else fail('This action is not available.');
    }
    const reply: Reply = {
      ok: true,
      snapshot: room ? projection(room, guest.id) : null,
    };
    guest.receipts.push(x.requestId);
    if (guest.receipts.length > 100) guest.receipts.shift();
    persist();
    if (room) broadcast(room);
    return reply;
  }
  io.use((socket, next) => {
    const auth = socket.handshake.auth;
    if (auth.v !== PROTOCOL_VERSION)
      return next(new Error('Update this tab to the latest MOVO version.'));
    const ip = socket.handshake.address,
      b = ipRates.get(ip);
    if (!b || now() - b.since > 60000)
      ipRates.set(ip, { count: 1, since: now() });
    else if (++b.count > 60)
      return next(new Error('Too many connections. Please wait a minute.'));
    let guest: SavedGuest | undefined, token: string | undefined;
    if (typeof auth.token === 'string' && auth.token) {
      guest = guests.get(hash(auth.token));
      if (!guest)
        return next(
          new Error('Your guest session expired. Start a new session.'),
        );
    } else {
      token = randomBytes(32).toString('base64url');
      guest = {
        id: randomUUID(),
        tokenHash: hash(token),
        name: 'Guest',
        roomCode: null,
        createdAt: now(),
        receipts: [],
      };
      guests.set(guest.tokenHash, guest);
    }
    socket.data.guest = guest;
    socket.data.token = token;
    next();
  });
  io.on('connection', (socket: Socket) => {
    const guest = socket.data.guest as SavedGuest,
      connections = live.get(guest.id) ?? new Set<string>();
    connections.add(socket.id);
    live.set(guest.id, connections);
    const room = rooms.get(guest.roomCode ?? '');
    if (room) {
      const m = room.members.find((p) => p.id === guest.id);
      if (m) {
        m.connected = true;
        m.disconnectedAt = null;
        mutate(room);
        updateDisconnect(room);
        broadcast(room);
      } else guest.roomCode = null;
    } else guest.roomCode = null;
    socket.emit('welcome', {
      playerId: guest.id,
      token: socket.data.token,
      name: guest.name,
      snapshot: room ? projection(room, guest.id) : null,
    });
    persist();
    let budget = 30,
      last = now();
    socket.on('intent', (input: unknown, ack?: (r: Reply) => void) => {
      if (typeof ack !== 'function') return;
      budget = Math.min(30, budget + (now() - last) / 150);
      last = now();
      if (budget < 1)
        return ack({
          ok: false,
          error: 'Slow down for a moment, then try again.',
        });
      budget--;
      try {
        ack(handle(guest, input));
      } catch (error) {
        ack({
          ok: false,
          error:
            error instanceof RuleError
              ? error.message
              : 'Something went wrong at the table. Please try again.',
        });
        if (!(error instanceof RuleError))
          console.error('Room action failed', error);
      }
    });
    socket.on('disconnect', () => {
      live.get(guest.id)?.delete(socket.id);
      if (live.get(guest.id)?.size) return;
      live.delete(guest.id);
      const r = rooms.get(guest.roomCode ?? ''),
        m = r?.members.find((p) => p.id === guest.id);
      if (r && m) {
        m.connected = false;
        m.disconnectedAt = now();
        mutate(r);
        updateDisconnect(r);
        broadcast(r);
        persist();
      }
    });
  });
  function updateDisconnect(room: Room) {
    const result = syncDisconnects(room, now());
    if (result.removeId) {
      const guest = [...guests.values()].find((g) => g.id === result.removeId);
      if (guest) leave(guest);
    } else if (result.changed) mutate(room);
    return result.changed;
  }
  function tick() {
    let changed = false;
    for (const room of rooms.values()) {
      if (updateDisconnect(room)) {
        broadcast(room);
        changed = true;
      }
      const active = activeMembers(room).map((m) => m.id);
      const unattended = eligibleVoters(room).length === 0;
      for (const m of room.members)
        if (
          !m.connected &&
          m.disconnectedAt !== null &&
          now() - m.disconnectedAt >= RECONNECT_CHECKPOINT_MS &&
          (room.match?.phase !== 'PLAYING' ||
            !active.includes(m.id) ||
            unattended)
        ) {
          const g = [...guests.values()].find((p) => p.id === m.id);
          if (g) leave(g);
          changed = true;
        }
      if (!rooms.has(room.code)) continue;
      if (room.match && !room.pause) {
        const r = resolveTimeout(room.match, now());
        if (r.events.length) {
          mutate(room, r);
          broadcast(room);
          changed = true;
        }
      }
      if (
        now() - room.updatedAt > 86400000 &&
        !room.members.some((m) => m.connected)
      ) {
        rooms.delete(room.code);
        chats.delete(room.code);
        reactions.delete(room.code);
        changed = true;
      }
    }
    for (const [key, g] of guests)
      if (
        !g.roomCode &&
        !live.has(g.id) &&
        now() - g.createdAt > 7 * 86400000
      ) {
        guests.delete(key);
        changed = true;
      }
    for (const [ip, b] of ipRates)
      if (now() - b.since > 120000) ipRates.delete(ip);
    for (const [key, timestamps] of socialRates)
      if (!timestamps.some((t) => now() - t < 5000)) socialRates.delete(key);
    if (changed) persist();
  }
  const timer = options.autoTick === false ? null : setInterval(tick, 250);
  return {
    http,
    io,
    rooms,
    guests,
    tick,
    projection,
    persist,
    listen: (port = 3001, host = '127.0.0.1') =>
      new Promise<number>((resolve) =>
        http.listen(port, host, () =>
          resolve((http.address() as { port: number }).port),
        ),
      ),
    close: async () => {
      if (timer) clearInterval(timer);
      await new Promise<void>((resolve) => io.close(() => resolve()));
      persist();
      db.close();
    },
  };
}

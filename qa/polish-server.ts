// LOCAL QA ONLY. Excluded from both application builds. Separate database/port.
// Fixture control is a local file, never an HTTP endpoint.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import { startProdServer } from 'vinext/server/prod-server';
import { io, type Socket } from 'socket.io-client';
import { createGameService } from '../server/service';
import { createAccountService, attachAccounts } from '../server/auth';
import { createMatch, teammates } from '../shared/game';
import { syncSquares } from '../shared/revenge-collision';
import {
  HOME_GATES,
  STARTS,
  type Position,
  type Seat,
} from '../shared/topology';
import type { Reply, Welcome } from '../shared/protocol';
mkdirSync('.data', { recursive: true });
const { server } = await startProdServer({ port: 3002, host: '127.0.0.1' });
const accounts = await createAccountService({
  database: '.data/polish-accounts.sqlite',
  baseURL: 'http://localhost:3002',
  secretPath: '.data/qa-auth-secret',
  cookiePrefix: 'movo-qa-account',
});
let nextRoll: number | null = null,
  last = '',
  working = false;
let nextRolls: number[] = [];
let clockOffset = 0;
const service = createGameService({
  httpServer: server,
  database: '.data/polish-qa.sqlite',
  now: () => Date.now() + clockOffset,
  roll: () => {
    const result = nextRoll ?? nextRolls.shift() ?? randomInt(1, 7);
    nextRoll = null;
    return result;
  },
});
const peers: { socket: Socket; id: string; name: string }[] = [];
attachAccounts(server, accounts);
async function send(socket: Socket, input: object) {
  const reply = await new Promise<Reply>((resolve) =>
    socket.emit('intent', { v: 1, requestId: randomUUID(), ...input }, resolve),
  );
  if (!reply.ok) throw Error(reply.error);
  return reply;
}
for (const name of ['KIV', 'NIDA', 'NOOR']) {
  const socket = io('http://localhost:3002', {
    auth: { v: 1 },
    transports: ['websocket'],
    forceNew: true,
  });
  const welcome = await new Promise<Welcome>((resolve) =>
    socket.once('welcome', resolve),
  );
  peers.push({ socket, name, id: welcome.playerId });
  socket.auth = { v: 1, token: welcome.token };
}
const track = (index: number, travelled = 10): Position => ({
  kind: 'TRACK',
  index,
  travelled,
});
const locked = (seat: Seat): Position => ({
  kind: 'HOME_GATE_LOCKED',
  index: HOME_GATES[seat],
  travelled: 50,
});
const timer = setInterval(async () => {
  if (working) return;
  working = true;
  try {
    const room = [...service.rooms.values()].find((r) =>
      r.members.some((m) => m.name === 'GROOT' && m.connected),
    );
    if (!room) return;
    for (const peer of peers)
      if (!room.members.some((m) => m.id === peer.id)) {
        const guest = [...service.guests.values()].find(
          (g) => g.id === peer.id,
        )!;
        if (guest.roomCode) await send(peer.socket, { type: 'leave' });
        await send(peer.socket, {
          type: 'join',
          name: peer.name,
          code: room.code,
        });
        await send(peer.socket, { type: 'ready', ready: true });
      }
    if (!existsSync('.data/qa-command.json')) return;
    const raw = readFileSync('.data/qa-command.json', 'utf8');
    if (raw === last) return;
    const command = JSON.parse(raw) as {
      scenario?: string;
      action?:
        | 'roll'
        | 'move'
        | 'cycles'
        | 'disconnect'
        | 'reconnect'
        | 'advance'
        | 'vote';
      milliseconds?: number;
      vote?: 'remove' | 'wait';
      actor?: string;
      nonce: string;
    };
    if (!room.match) return;
    last = raw;
    if (command.action) {
      if (command.action === 'advance') {
        clockOffset += command.milliseconds ?? 0;
        service.tick();
        console.log(`QA clock advanced ${command.milliseconds}ms`);
        return;
      }
      if (['disconnect', 'reconnect', 'vote'].includes(command.action)) {
        const peer = peers.find((p) => p.name === command.actor)!;
        if (command.action === 'disconnect') peer.socket.disconnect();
        else if (command.action === 'reconnect')
          setTimeout(() => peer.socket.connect(), command.milliseconds ?? 0);
        else
          await send(peer.socket, {
            type: 'disconnectVote',
            vote: command.vote,
            decisionId: room.pause?.decisions[0]?.id,
            targetId: room.pause?.decisions[0]?.playerId,
          });
        console.log(`QA ${peer.name}: ${command.action}`);
        return;
      }
      if (command.action === 'cycles') {
        for (let i = 0; i < 12; i++) {
          const match = room.match!,
            peer = peers.find((p) => p.id === match.currentPlayerId);
          if (!peer) break;
          nextRoll = 1;
          if (match.revenge ? match.revenge.rollPending : match.dice === null)
            await send(peer.socket, {
              type: 'roll',
              revision: match.revision,
              matchId: match.id,
            });
          const current = room.match!,
            legal = service.projection(room, peer.id).legal;
          if (current.dice !== null && legal.length)
            await send(peer.socket, {
              type: 'move',
              revision: current.revision,
              matchId: current.id,
              pieceId: legal[0].pieceId,
              targetId: legal[0].targetId,
              dieId: legal[0].dieId,
            });
        }
        console.log('Completed actual peer turns for support rotations');
        return;
      }
      const s = room.match,
        peer = peers.find(
          (p) =>
            p.id ===
            (command.action === 'move'
              ? (s.revenge?.beneficiaryId ?? s.currentPlayerId)
              : s.currentPlayerId),
        );
      if (!peer)
        throw Error('GROOT acts through the visible browser controls.');
      const legal = service.projection(room, peer.id).legal;
      await send(peer.socket, {
        type: command.action,
        revision: s.revision,
        matchId: s.id,
        pieceId: legal[0]?.pieceId,
        targetId: legal[0]?.targetId,
        dieId: legal[0]?.dieId,
      });
      console.log(`QA peer ${peer.name}: ${command.action}`);
      return;
    }
    const scenario = command.scenario;
    const s = createMatch(
      room.match.id,
      room.match.players,
      0,
      Date.now(),
      room.settings.mode,
    );
    s.revision = room.match.revision + 1;
    const actor = s.players.find((p) => p.name === (command.actor ?? 'GROOT'))!;
    s.currentPlayerId = actor.id;
    if (s.revenge) s.revenge.beneficiaryId = actor.id;
    const own = s.pieces.filter((p) => p.ownerId === actor.id),
      enemy = s.players.find((p) => !teammates(s, p.id, actor.id))!,
      rivals = s.pieces.filter((p) => p.ownerId === enemy.id),
      partner = s.players.find(
        (p) => p.id !== actor.id && teammates(s, p.id, actor.id),
      );
    nextRoll = 1;
    nextRolls = [];
    if (scenario?.startsWith('revenge-')) {
      if (!s.revenge || !partner)
        throw Error('Choose Revenge for these fixtures.');
      const ally = s.pieces.filter((p) => p.ownerId === partner.id),
        secondEnemy = s.players.find(
          (p) => p.team === enemy.team && p.id !== enemy.id,
        )!,
        others = s.pieces.filter((p) => p.ownerId === secondEnemy.id);
      if (
        [
          'revenge-home1',
          'revenge-wrong',
          'revenge-home2',
          'revenge-empty',
          'revenge-six-six',
          'revenge-multiple',
          'revenge-optional',
          'revenge-required',
          'revenge-pool-normal',
        ].includes(scenario)
      ) {
        own[0].position = { kind: 'HOME' };
        own[1].position = track(4);
        if (!['revenge-empty', 'revenge-pool-normal'].includes(scenario))
          rivals[0].position = {
            kind: 'HOME_LANE',
            index: ['revenge-home1', 'revenge-wrong'].includes(scenario)
              ? 0
              : 1,
          };
        if (scenario === 'revenge-optional') own[2].position = { kind: 'HOME' };
        if (['revenge-multiple', 'revenge-required'].includes(scenario)) {
          own[2].position = { kind: 'HOME' };
          own[3].position = { kind: 'HOME' };
          if (scenario === 'revenge-multiple')
            others[0].position = { kind: 'HOME_LANE', index: 1 };
        }
        nextRoll = 6;
        nextRolls = ['revenge-six-six', 'revenge-pool-normal'].includes(
          scenario,
        )
          ? [6, 4]
          : scenario === 'revenge-empty'
            ? [6, 6, 6, 6, 4]
            : [scenario === 'revenge-home1' ? 5 : 4];
      } else if (scenario === 'revenge-six-chain') {
        nextRoll = 6;
        nextRolls = [6, 6, 6, 6, 1];
      } else if (scenario === 'revenge-stack-selection') {
        own[0].position = track(6);
        own[1].position = track(6);
        ally[0].position = track(6);
        rivals[0].position = track(6);
        nextRoll = 3;
      } else if (scenario === 'revenge-gate') {
        own[0].position = track((HOME_GATES[actor.seat] + 51) % 52, 49);
        nextRoll = 3;
      } else if (scenario === 'revenge-unlock') {
        own[0].position = locked(actor.seat);
        own[1].position = track(3);
        rivals[0].position = track(6);
        nextRoll = 3;
      } else if (scenario === 'revenge-same-stack') {
        own[0].position = track(3);
        rivals[0].position = track(6);
        rivals[1].position = track(6);
        nextRoll = 3;
      } else if (
        [
          'revenge-halki-shield-normal',
          'revenge-halki-shield-halki',
          'revenge-same-owner-halki',
        ].includes(scenario)
      ) {
        own[0].position =
          scenario === 'revenge-halki-shield-normal'
            ? track(3)
            : {
                kind: 'HALKI_TRACK',
                homeSeat: enemy.seat,
                index: 9,
                travelled: 2,
              };
        rivals[0].position = track(6);
        const defender =
          scenario === 'revenge-same-owner-halki' ? rivals[1] : others[0];
        defender.position = {
          kind: 'HALKI_TRACK',
          homeSeat: actor.seat,
          index: 6,
          travelled: 2,
        };
        nextRoll = 3;
      } else if (scenario === 'revenge-used-finish') {
        own[0].position = { kind: 'HOME', homeSeat: enemy.seat };
        own[0].hasUsedHalki = true;
        own[0].halkiInvadedHomeOwnerId = enemy.id;
        own[1].position = { kind: 'HOME' };
        rivals[0].position = { kind: 'HOME_LANE', index: 1 };
        nextRoll = 6;
        nextRolls = [4];
      } else if (
        [
          'revenge-shield',
          'revenge-contest',
          'revenge-break',
          'revenge-reinforce',
          'revenge-dynamic',
          'revenge-double',
        ].includes(scenario)
      ) {
        if (scenario === 'revenge-shield') {
          own[0].position = track(3);
          ally[0].position = track(6);
          nextRoll = 3;
        } else if (
          scenario === 'revenge-contest' ||
          scenario === 'revenge-double'
        ) {
          rivals[0].position = track(6);
          others[0].position = track(6);
          own[0].position = track(3);
          if (scenario === 'revenge-double') ally[0].position = track(6);
          nextRoll = 3;
        } else {
          own[0].position = track(6);
          ally[0].position = track(6);
          rivals[0].position =
            scenario === 'revenge-dynamic'
              ? { kind: 'HALKI_TRACK', homeSeat: 1, index: 6, travelled: 2 }
              : track(6);
          if (scenario === 'revenge-dynamic') {
            own[1].position = track(6);
            nextRoll = 1;
          } else if (scenario.includes('reinforce')) {
            own[1].position = track(3);
            nextRoll = 3;
          } else nextRoll = 1;
        }
      } else if (
        [
          'revenge-halki-one',
          'revenge-halki-two',
          'revenge-halki-three',
          'revenge-halki-safe',
        ].includes(scenario)
      ) {
        const index = scenario === 'revenge-halki-safe' ? 8 : 6;
        own[0].position = {
          kind: 'HALKI_TRACK',
          homeSeat: 1,
          index: index + 3,
          travelled: 3,
        };
        rivals[0].position = track(index);
        if (
          scenario !== 'revenge-halki-one' &&
          scenario !== 'revenge-halki-safe'
        )
          others[0].position = track(index);
        if (scenario === 'revenge-halki-three')
          rivals[1].position = track(index);
        nextRoll = 3;
      } else if (scenario === 'revenge-death') {
        own[0].position = track(3);
        rivals[0].position = {
          kind: 'HALKI_TRACK',
          homeSeat: 1,
          index: 6,
          travelled: 2,
        };
        nextRoll = 3;
      } else if (scenario === 'revenge-reverse') {
        own[0].position = {
          kind: 'HALKI_HOME_INVASION',
          homeSeat: enemy.seat,
          index: 4,
        };
        nextRoll = 3;
      } else if (scenario === 'revenge-home-exit') {
        own[0].position = {
          kind: 'HALKI_HOME_INVASION',
          homeSeat: enemy.seat,
          index: 1,
        };
        nextRoll = 4;
      } else if (scenario === 'revenge-finish') {
        own[0].position = {
          kind: 'HALKI_TRACK',
          homeSeat: 1,
          index: (HOME_GATES[enemy.seat] + 1) % 52,
          travelled: 51,
        };
        nextRoll = 3;
      } else if (scenario === 'revenge-support') {
        for (let i = 0; i < 3; i++) own[i].position = { kind: 'HOME' };
        own[3].position = { kind: 'HOME_LANE', index: 4 };
        nextRoll = 1;
        nextRolls = [6];
      } else if (scenario === 'revenge-victory') {
        for (const p of [...own, ...ally]) p.position = { kind: 'HOME' };
        own[3].position = { kind: 'HALKI_HOME_RETURN', homeSeat: 1, index: 4 };
        s.revenge.secured = [partner.id];
        s.revenge.support[partner.id] = {
          rotationsLeft: 0,
          pending: [],
          ready: true,
        };
        nextRoll = 1;
      } else throw Error('Unknown Revenge fixture');
      // Synthetic starting positions represent prior legal play. Keep their
      // lifetime/route history consistent with the authoritative engine.
      for (const piece of s.pieces) {
        const owner = s.players.find((p) => p.id === piece.ownerId)!;
        if (
          [
            'HOME',
            'HOME_LANE',
            'HALKI_TRACK',
            'HALKI_HOME_INVASION',
            'HALKI_HOME_RETURN',
          ].includes(piece.position.kind)
        ) {
          owner.homeUnlocked = true;
          owner.knocked = 1;
        }
        if (
          piece.position.kind === 'HALKI_TRACK' ||
          piece.position.kind === 'HALKI_HOME_INVASION' ||
          piece.position.kind === 'HALKI_HOME_RETURN'
        ) {
          piece.hasUsedHalki = true;
          const homeSeat = piece.position.homeSeat;
          const target =
            s.players.find(
              (p) => p.seat === homeSeat && p.team !== owner.team,
            ) ?? s.players.find((p) => p.team !== owner.team)!;
          piece.position.homeSeat = target.seat;
          piece.halkiInvadedHomeOwnerId = target.id;
        }
      }
      syncSquares(s);
    } else if (scenario?.startsWith('step-')) {
      own[0].position = track(10);
      nextRoll = Number(scenario.slice(5));
    } else if (scenario?.startsWith('own-stack-')) {
      const count = Number(scenario.slice(10));
      own.slice(0, count).forEach((p) => {
        p.position = track(10);
      });
      nextRoll = 4;
    } else if (scenario === 'opening') nextRoll = 6;
    else if (['one', 'four', 'six', 'corner'].includes(scenario ?? '')) {
      own[0].position = track(scenario === 'corner' ? 10 : 1);
      nextRoll = scenario === 'one' ? 1 : scenario === 'four' ? 4 : 6;
    } else if (scenario === 'knock' || scenario === 'unlock') {
      own[0].position = track(3);
      rivals[0].position = track(6);
      nextRoll = 3;
      if (scenario === 'unlock') {
        own[1].position = locked(actor.seat);
        own[2].position = locked(actor.seat);
      }
    } else if (scenario === 'safe') {
      own[0].position = track(6);
      rivals[0].position = track(8);
      nextRoll = 2;
    } else if (scenario === 'stack' || scenario === 'pass-stack') {
      own[0].position = track(1);
      rivals[0].position = track(3);
      rivals[1].position = track(3);
      nextRoll = scenario === 'stack' ? 2 : 4;
    } else if (scenario === 'locked') {
      own[0].position = track((STARTS[actor.seat] + 47) % 52, 47);
      nextRoll = 5;
    } else if (scenario === 'gate-knock' || scenario === 'friendly-gate') {
      const victim = scenario === 'friendly-gate' ? partner! : enemy;
      s.pieces
        .filter((p) => p.ownerId === victim.id)
        .slice(0, 2)
        .forEach((p) => {
          p.position = locked(victim.seat);
        });
      own[0].position = track((HOME_GATES[victim.seat] + 51) % 52);
      nextRoll = 1;
    } else if (scenario === 'friendly') {
      if (!partner) throw Error('Choose 2v2.');
      own[0].position = track(3);
      s.pieces.find((p) => p.ownerId === partner.id)!.position = track(6);
      nextRoll = 3;
    } else if (
      [
        'home-entry',
        'exact',
        'overshoot',
        'victory',
        'team-victory',
        'finished-teammate',
      ].includes(scenario ?? '')
    ) {
      actor.homeUnlocked = true;
      actor.knocked = 1;
      nextRoll = 3;
      own[0].position =
        scenario === 'home-entry'
          ? track((STARTS[actor.seat] + 49) % 52, 49)
          : { kind: 'HOME_LANE', index: 2 };
      if (scenario === 'overshoot') nextRoll = 5;
      if (
        ['victory', 'team-victory', 'finished-teammate'].includes(scenario!)
      ) {
        own.forEach((p) => {
          p.position = { kind: 'HOME' };
        });
        own[3].position = { kind: 'HOME_LANE', index: 4 };
        nextRoll = 1;
      }
      if (scenario === 'team-victory') {
        if (!partner) throw Error('Choose 2v2.');
        partner.homeUnlocked = true;
        partner.knocked = 1;
        s.pieces
          .filter((p) => p.ownerId === partner.id)
          .forEach((p) => {
            p.position = { kind: 'HOME' };
          });
      }
    } else throw Error('Unknown fixture');
    room.match = s;
    room.pause = null;
    room.events = [];
    room.version++;
    for (const socket of service.io.sockets.sockets.values())
      if (room.members.some((m) => m.id === socket.data.guest.id))
        socket.emit('snapshot', service.projection(room, socket.data.guest.id));
    service.persist();
    console.log(`Prepared ${s.mode}: ${scenario} · ${actor.name}`);
  } catch (e) {
    console.error(e instanceof Error ? e.message : 'QA failed');
  } finally {
    working = false;
  }
}, 120);
console.log(
  'Local fixture table: http://localhost:3002 — create a room as GROOT. Three real Socket.IO peers join automatically.',
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    clearInterval(timer);
    peers.forEach((p) => p.socket.disconnect());
    void service.close().then(() => {
      accounts.close();
      process.exit(0);
    });
  });

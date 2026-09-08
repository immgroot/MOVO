import { randomUUID } from 'node:crypto';
import { RuleError } from '../shared/game';
import type { Room, Intent, DisconnectDecision } from '../shared/protocol';
export const DISCONNECT_PAUSE_MS = 25_000;
export const RECONNECT_CHECKPOINT_MS = 90_000;
export const REMOVAL_VOTE_MS = 30_000;
export const RESUME_MS = 4_000; // one second of welcome, then 3, 2, 1
export const activeMembers = (room: Room) =>
  room.members.filter(
    (m) =>
      m.seat !== null &&
      room.match?.players.some((p) => p.id === m.id && !p.forfeited),
  );
export const eligibleVoters = (room: Room) =>
  activeMembers(room).filter((m) => m.connected);
const waiting = (d: DisconnectDecision, now: number) => {
  d.phase = 'waiting';
  d.outcome = 'wait';
  d.voteClosesAt = null;
  d.checkpointAt = Math.max(
    d.disconnectedAt + RECONNECT_CHECKPOINT_MS,
    now +
      (now >= d.disconnectedAt + RECONNECT_CHECKPOINT_MS
        ? RECONNECT_CHECKPOINT_MS
        : 0),
  );
};
/** Room-level pause only. Captures, movement and forfeit outcomes stay in the game engine. */
export function syncDisconnects(
  room: Room,
  now: number,
): { changed: boolean; removeId?: string } {
  if (room.match?.phase !== 'PLAYING') {
    const changed = Boolean(room.pause);
    room.pause = null;
    return { changed };
  }
  const missing = activeMembers(room)
    .filter((m) => !m.connected && m.disconnectedAt !== null)
    .sort((a, b) => a.disconnectedAt! - b.disconnectedAt! || a.seat! - b.seat!);
  const expired = missing.filter(
    (m) => now - m.disconnectedAt! >= DISCONNECT_PAUSE_MS,
  );
  let changed = false;
  if (!room.pause && expired.length) {
    const startedAt = expired[0].disconnectedAt! + DISCONNECT_PAUSE_MS;
    room.pause = {
      startedAt,
      remainingMs:
        room.match.deadline === null
          ? null
          : Math.max(0, room.match.deadline - startedAt),
      resumeAt: null,
      returnedIds: [],
      decisions: [],
    };
    room.match.revision++;
    changed = true;
  }
  const pause = room.pause;
  if (!pause) return { changed };
  const gone = pause.decisions.filter(
    (d) => !missing.some((m) => m.id === d.playerId),
  );
  if (gone.length) {
    for (const d of gone)
      if (
        room.members.some((m) => m.id === d.playerId && m.connected) &&
        !pause.returnedIds.includes(d.playerId)
      )
        pause.returnedIds.push(d.playerId);
    pause.decisions = pause.decisions.filter((d) => !gone.includes(d));
    changed = true;
  }
  for (const m of expired)
    if (!pause.decisions.some((d) => d.playerId === m.id)) {
      pause.decisions.push({
        id: randomUUID(),
        playerId: m.id,
        disconnectedAt: m.disconnectedAt!,
        phase: 'decision',
        checkpointAt: Math.max(
          now,
          m.disconnectedAt! + RECONNECT_CHECKPOINT_MS,
        ),
        voteClosesAt: null,
        votes: {},
        round: 1,
      });
      changed = true;
    }
  if (!missing.length) {
    if (pause.resumeAt === null) {
      pause.resumeAt = now + RESUME_MS;
      changed = true;
    } else if (now >= pause.resumeAt) {
      room.match.deadline =
        pause.remainingMs === null ? null : pause.resumeAt + pause.remainingMs;
      room.match.revision++;
      room.pause = null;
      changed = true;
    }
    return { changed };
  }
  if (pause.resumeAt !== null) {
    pause.resumeAt = null;
    changed = true;
  }
  const d = pause.decisions[0];
  if (!d) return { changed };
  if (d.phase === 'voting') {
    const eligible = eligibleVoters(room).map((m) => m.id);
    const votes = Object.fromEntries(
      Object.entries(d.votes).filter(([id]) => eligible.includes(id)),
    );
    if (Object.keys(votes).length !== Object.keys(d.votes).length) {
      d.votes = votes;
      changed = true;
    }
    const yes = Object.values(votes).filter((v) => v === 'remove').length;
    const no = Object.values(votes).filter((v) => v === 'wait').length;
    if (eligible.length && yes > eligible.length / 2)
      return { changed: true, removeId: d.playerId };
    if (
      !eligible.length ||
      no >= Math.ceil(eligible.length / 2) ||
      now >= d.voteClosesAt!
    ) {
      waiting(d, now);
      changed = true;
    }
  } else if (now >= d.checkpointAt) {
    d.phase = 'decision';
    d.round++;
    d.id = randomUUID();
    d.votes = {};
    delete d.outcome;
    d.checkpointAt = now + RECONNECT_CHECKPOINT_MS;
    changed = true;
  }
  return { changed };
}
export function disconnectDecision(
  room: Room,
  actorId: string,
  intent: Intent,
  now: number,
) {
  const d = room.pause?.decisions[0];
  if (
    room.match?.phase !== 'PLAYING' ||
    !room.pause ||
    room.pause.resumeAt !== null ||
    !d ||
    d.id !== intent.decisionId ||
    d.playerId !== intent.targetId
  )
    throw new RuleError(
      'This reconnect decision has changed. Check the updated table.',
    );
  if (
    !eligibleVoters(room).some((m) => m.id === actorId) ||
    actorId === d.playerId
  )
    throw new RuleError('Only connected active players can decide.');
  if (intent.type === 'disconnectWait') {
    if (d.phase === 'voting')
      throw new RuleError('Choose NO — WAIT in the active vote.');
    waiting(d, now);
  } else if (intent.type === 'disconnectVoteStart') {
    if (d.phase === 'voting')
      throw new RuleError('A removal vote is already open.');
    d.phase = 'voting';
    d.id = randomUUID();
    d.votes = {};
    delete d.outcome;
    d.voteClosesAt = now + REMOVAL_VOTE_MS;
  } else {
    if (d.phase !== 'voting' || !['remove', 'wait'].includes(intent.vote!))
      throw new RuleError('Choose YES — REMOVE or NO — WAIT.');
    if (d.votes[actorId])
      throw new RuleError('Your vote has already been counted.');
    d.votes[actorId] = intent.vote!;
  }
}

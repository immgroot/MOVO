import type { Match, GameEvent, Move, Mode } from './game';
import type { Seat } from './topology';
import type { ChatMessage, Reaction } from './chat';
import type { Cosmetics } from './cosmetics';
export interface RoomSettings {
  mode: Mode;
  name: string;
  capacity: 2 | 3 | 4;
  private: boolean;
  timerSeconds: 0 | 15 | 30 | 45;
  spectators: boolean;
}
export interface Member {
  cosmetics?: Cosmetics;
  id: string;
  name: string;
  seat: Seat | null;
  ready: boolean;
  connected: boolean;
  disconnectedAt: number | null;
}
export interface Room {
  pause?: DisconnectPause | null;
  code: string;
  hostId: string;
  settings: RoomSettings;
  members: Member[];
  match: Match | null;
  version: number;
  events: GameEvent[];
  updatedAt: number;
  banned: string[];
}
export interface Snapshot {
  pause?: DisconnectPause | null;
  chat?: ChatMessage[];
  reactions?: Reaction[];
  code: string;
  hostId: string;
  settings: RoomSettings;
  members: Member[];
  match: Match | null;
  version: number;
  events: GameEvent[];
  selfId: string;
  legal: Move[];
  serverNow: number;
}
export interface Guest {
  cosmetics?: Cosmetics;
  id: string;
  name: string;
  roomCode: string | null;
  createdAt: number;
}
export interface Intent {
  decisionId?: string;
  vote?: 'remove' | 'wait';
  cosmetics?: Cosmetics;
  v: 1;
  requestId: string;
  type:
    | 'create'
    | 'join'
    | 'quick'
    | 'ready'
    | 'start'
    | 'roll'
    | 'move'
    | 'declineHalki'
    | 'leave'
    | 'kick'
    | 'transfer'
    | 'rematch'
    | 'profile'
    | 'disconnectWait'
    | 'disconnectVoteStart'
    | 'disconnectVote'
    | 'randomize'
    | 'chat'
    | 'reaction';
  text?: string;
  emoji?: string;
  mode?: Mode;
  revision?: number;
  matchId?: string;
  name?: string;
  code?: string;
  spectate?: boolean;
  settings?: RoomSettings;
  pieceId?: string;
  dieId?: string;
  targetId?: string;
  ready?: boolean;
}
export interface DisconnectDecision {
  id: string;
  playerId: string;
  disconnectedAt: number;
  phase: 'decision' | 'waiting' | 'voting';
  checkpointAt: number;
  voteClosesAt: number | null;
  votes: Record<string, 'remove' | 'wait'>;
  round: number;
  outcome?: 'wait';
}
export interface DisconnectPause {
  startedAt: number;
  remainingMs: number | null;
  resumeAt: number | null;
  returnedIds: string[];
  decisions: DisconnectDecision[];
}
export interface Reply {
  ok: boolean;
  error?: string;
  snapshot?: Snapshot | null;
}
export interface Welcome {
  playerId: string;
  token?: string;
  name: string;
  snapshot: Snapshot | null;
}

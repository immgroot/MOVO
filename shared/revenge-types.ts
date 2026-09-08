import type { Team } from './game';

export interface Contest {
  index: number;
  pieceIds: string[];
  shields: Team[];
  kind: 'SHIELD' | 'DOUBLE_SHIELD' | 'HALKI' | 'STACK';
}
export interface Support {
  rotationsLeft: number;
  pending: string[];
  ready: boolean;
}
export interface RevengeState {
  version: 2;
  secured: string[];
  support: Record<string, Support>;
  beneficiaryId: string;
  contests: Contest[];
  shields: { index: number; teams: Team[]; halkiTeams?: Team[] }[];
  rulePending: string | null;
  diceHistory: number[];
  awaitingBonus: boolean;
  queuedRolls: number[];
  activationValue: number | null;
  endAfterQueue: boolean;
  diceFlowVersion: 1;
  turnDice: TurnDie[];
  rollPending: boolean;
  declinedPairs: string[];
  halkiChoice: { dieIds: [string, string]; required: boolean } | null;
  previousTurn: { playerId: string; dice: TurnDie[] } | null;
}
export interface TurnDie {
  id: string;
  value: number;
  bonusOf: string | null;
  status: 'available' | 'used' | 'halki' | 'unplayable' | 'ended';
  pieceId?: string;
}

import type { Seat } from './topology';
export const REACTIONS = [
  '😂',
  '😭',
  '💀',
  '😡',
  '🔥',
  '👀',
  '👏',
  '😈',
] as const;
export interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  seat: Seat;
  text: string;
  at: number;
}
export interface Reaction {
  id: string;
  playerId: string;
  emoji: (typeof REACTIONS)[number];
  at: number;
}

import type { Position } from './topology';

// Presentation timing never influences legal moves or server resolution.
export const NORMAL_STEP_MS = 150;
export const REDUCED_STEP_MS = 45;
export const hopDuration = (_index: number, _count: number) => NORMAL_STEP_MS;
export interface PieceMotion {
  delay?: number;
  key: number;
  pieceId: string;
  from: Position;
  duration: number;
  kind: 'hop' | 'return';
  final: boolean;
  reduced: boolean;
}

/** REVENGE is accepted only as the saved/older client alias for Team. */
export type Mode =
  | 'KNOCKOUT'
  | 'KNOCKOUT_2V2'
  | 'REVENGE_TEAM'
  | 'REVENGE_SOLO'
  | 'REVENGE';
export const MODES = [
  'KNOCKOUT',
  'KNOCKOUT_2V2',
  'REVENGE_TEAM',
  'REVENGE_SOLO',
] as const;
export const isRevenge = (mode: Mode) =>
  mode === 'REVENGE' || mode === 'REVENGE_TEAM' || mode === 'REVENGE_SOLO';
export const isTeamMode = (mode: Mode) =>
  mode === 'KNOCKOUT_2V2' || mode === 'REVENGE' || mode === 'REVENGE_TEAM';
export const normalizeMode = (mode: Mode): Mode =>
  mode === 'REVENGE' ? 'REVENGE_TEAM' : mode;
export const modeName = (mode: Mode) =>
  mode === 'KNOCKOUT_2V2'
    ? 'KNOCKOUT 2v2'
    : normalizeMode(mode).replace('_', ' ');

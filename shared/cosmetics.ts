export const BOARD_STYLES = ['classic', 'premium', 'colorful'] as const;
export type BoardStyle = (typeof BOARD_STYLES)[number];
export const AVATARS = [
  {
    id: 'movo',
    name: 'The original',
    path: 'M24 6 42 24 24 42 6 24Z M24 15 33 24 24 33 15 24Z',
  },
  {
    id: 'kite',
    name: 'Patang',
    path: 'M24 5 39 23 24 37 9 23Z M24 5V37 M9 23H39 M24 37 20 43 27 46',
  },
  {
    id: 'sun',
    name: 'Dhoop',
    path: 'M24 15a9 9 0 1 0 0 18 9 9 0 1 0 0-18 M24 4V9 M24 39V44 M4 24H9 M39 24H44 M10 10 14 14 M34 34 38 38 M10 38 14 34 M34 14 38 10',
  },
  {
    id: 'moon',
    name: 'Chaand',
    path: 'M33 7A18 18 0 1 0 41 33 17 17 0 0 1 33 7Z M37 13V21 M33 17H41',
  },
  {
    id: 'lotus',
    name: 'Kamal',
    path: 'M24 6Q8 22 24 39Q40 22 24 6Z M24 39Q6 39 5 19Q22 20 24 39 M24 39Q42 39 43 19Q26 20 24 39',
  },
  {
    id: 'orbit',
    name: 'Orbit',
    path: 'M24 18a6 6 0 1 0 0 12 6 6 0 1 0 0-12 M8 37Q-2 23 20 10Q44-3 42 14Q40 31 18 41Q8 46 8 37Z',
  },
  {
    id: 'arch',
    name: 'Darwaza',
    path: 'M10 40V23Q10 8 24 5Q38 8 38 23V40Z M18 40V25Q18 18 24 15Q30 18 30 25V40 M6 40H42',
  },
  {
    id: 'waves',
    name: 'Lehar',
    path: 'M5 15Q14 5 24 15T43 15 M5 25Q14 15 24 25T43 25 M5 35Q14 25 24 35T43 35',
  },
] as const;
export const BANNERS = [
  { id: 'classic', name: 'Classic Dark' },
  { id: 'ember', name: 'Ember' },
  { id: 'tide', name: 'Tide' },
  { id: 'grove', name: 'Grove' },
  { id: 'gold', name: 'Gold' },
  { id: 'revenge', name: 'Revenge' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'signature', name: 'Signature' },
] as const;
export interface Cosmetics {
  avatar: string;
  banner: string;
}
export const DEFAULT_COSMETICS: Cosmetics = {
  avatar: 'movo',
  banner: 'classic',
};
export function publicCosmetics(value?: Partial<Cosmetics> | null): Cosmetics {
  return {
    avatar: AVATARS.some((a) => a.id === value?.avatar)
      ? value!.avatar!
      : 'movo',
    banner: BANNERS.some((b) => b.id === value?.banner)
      ? value!.banner!
      : 'classic',
  };
}
export const boardStyle = (value: unknown): BoardStyle =>
  value === 'classic' || value === 'colorful' ? value : 'premium';
// Shared schema keeps the account client and server's allowed field names aligned.
export const cosmeticFields = {
  avatar: { type: 'string' as const, defaultValue: 'movo', required: false },
  banner: { type: 'string' as const, defaultValue: 'classic', required: false },
  boardTheme: {
    type: 'string' as const,
    defaultValue: 'premium',
    required: false,
  },
};

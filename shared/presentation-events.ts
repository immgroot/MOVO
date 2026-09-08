import type { GameEvent } from './game';
export function capturePresentation(events: GameEvent[]) {
  const victims = events.filter(
    (e, i) =>
      e.type === 'PIECE_KNOCKED' &&
      e.pieceId &&
      events.findIndex(
        (x) => x.type === 'PIECE_KNOCKED' && x.pieceId === e.pieceId,
      ) === i,
  );
  const halki = events.some(
    (e) =>
      e.type === 'HALKI_ACTIVATED' ||
      (e.type === 'PIECE_MOVED' &&
        e.path?.some((p) => p.kind.startsWith('HALKI_'))),
  );
  return { effect: 'movo-impact' as const, victims, halki, duration: 520 };
}

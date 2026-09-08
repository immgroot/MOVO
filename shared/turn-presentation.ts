import type { Match } from './game';
/** Local interaction labels, never additional server/public piece metadata. */
export function localPieceNumbers(match: Match, selfId: string): string[] {
  if (
    match.mode !== 'REVENGE' ||
    match.phase !== 'PLAYING' ||
    match.revenge?.beneficiaryId !== selfId ||
    match.revenge.secured.includes(selfId)
  )
    return [];
  return match.pieces.filter((p) => p.ownerId === selfId).map((p) => p.id);
}

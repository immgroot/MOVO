# MOVO rules and board update

Implemented in the existing project. No commit, push or deployment was performed.

## Gameplay changes

- Existing Revenge is now **Revenge Team**; **Revenge Solo** supports 2, 3 or 4 individual players. Both share the same Revenge engine. Solo has no teammate protection, support turns or team victory. Older REVENGE identifiers are accepted as the Team alias.
- Revenge collects the entire consecutive-six streak. Only when a non-six ends a streak divisible by three are all its sixes marked burned. The non-six remains usable. Server dice remain cryptographically random, with no balancing or forced results.
- Every die retains its ID and status. Ordinary dice must be spent in order. An unusable current die forfeits later dice; burned dice do not block the non-six. A valid Halki activation consumes only its exact six/bonus pair, preserving earlier dice.
- Revenge normal Home entry now requires that physical piece's own capture credit. Exact movement applies at the Home door and Finish; excess pips cannot be discarded.
- Halki activation is optional except with exactly three finished pieces, one normal unfinished piece and a real legal Home target. An active Halki attack does not force an unrelated move. Existing once-per-token lifetime, reversed Home mapping, original invaded Home and complete reverse route are retained and tested.
- Genuine teammate shields use different allied owners. Same-owner doubles do not create shields. Revenge Halki respects genuine Team shields and can capture up to two eligible unprotected defenders. Solo never grants teammate protection. Existing normal Revenge same-owner stack capture behavior is preserved.
- Knockout and Knockout 2v2 now punish each physical piece that ignored its own legal capture. The selected piece completes its move. Capturing with one piece does not excuse another piece's missed capture. Protected or otherwise illegal targets never create a penalty.
- Knockout 2v2 protects mixed teammate stacks, and that protection is used by the authoritative legal-move engine and missed-capture checks.
- **Solo stalemate escape:** only when all remaining unfinished pieces are locked at their own Home doors, with no capture, future normal movement or Halki action capable of breaking the position, the server grants those trapped pieces a Home-entry waiver. It does not move pieces, credit fake captures or instantly finish them. Exact movement, dice order and turn order remain intact. Team mode is unaffected. The per-piece waiver survives reconnects.

## Presentation changes

- Each player's board and player-card positions are projected with their own color at the bottom. Spectators keep the neutral view. Server coordinates, tile IDs, routes and capture calculations do not rotate.
- Finished physical tokens occupy individual center finish slots. A Halki activation removes the actual selected token from its slot. Tokens remain identifiable; they are not replaced by a count.
- Added Colorful alongside Classic and Premium, with persistent account/device preference support. Removed filler wording from the board.
- Enlarged the desktop board with responsive grid placement that keeps player cards outside its footprint.
- Dice lift, tumble through presentation-only faces, slow, land, bounce and settle on the authoritative value. Reduced motion uses a short transition. These frames never roll dice or mutate server state.
- Updated mode choices, dice status labels, per-piece Home access labels and affected tutorial text.

## Verification

- **431 tests passed across 19 files** (105 more tests than the previous 326-test suite).
- Typecheck: passed.
- Lint: passed.
- Production build: passed.
- Formatting check: passed.
- Git whitespace check: passed.
- Added dedicated rule expansion, Solo stalemate and board/dice presentation tests. Updated obsolete rule expectations rather than preserving contradictory behavior.
- Added real Socket.IO Solo coverage for 2/3/4 players, rejected out-of-order moves, reconnect state and client attempts to substitute a roll.
- Complete deterministic match simulations cover both Revenge modes and both Knockout modes.
- Browser checks covered all four player viewpoints/modes. At 1440×1000, 1280×720, 820×1180, 390×844 and 844×390, no board/card overlap or horizontal page overflow was detected. Desktop board width reached 680 px.
- Browser dice capture observed intermediate faces 1, 4, 6, 3, 2, then authoritative result 5; final result stayed 5. No browser page errors were reported.
- Local-only QA assets and logs are under ignored .data/. The isolated QA server used in-memory accounts and matches.

## Compatibility and manual review

No requested gameplay rule remains unresolved after the Solo stalemate clarification.

Old in-progress saves may lack enough information to establish personal capture history or may contain dice collected under the earlier rules. Such matches are paused with an explicit new-match message instead of guessing history or applying old dice behavior. New matches retain capture credit, dice status, Halki lifetime/origin and Solo waivers across reconnects.

The build prints Vinext's existing static-route-classification notice; the build exits successfully.

A human visual review is still useful for the subjective dice timing, the small center finish markers, all three themes, reduced-motion preferences and touch interaction on physical phones. Automated layout checks do not replace that subjective review.

## Files changed

Application and server:

- app/layout.tsx
- app/rules-polish.css (new)
- components/game/Board.tsx
- components/game/Cosmetics.tsx
- components/game/Die.tsx
- components/game/Movo.tsx
- components/game/RevengeTutorial.tsx
- components/game/Tutorial.tsx
- hooks/use-game.ts
- server/service.ts

Shared rules and presentation:

- shared/board-view.ts (new)
- shared/cosmetics.ts
- shared/dice-presentation.ts (new)
- shared/game.ts
- shared/modes.ts (new)
- shared/revenge-collision.ts
- shared/revenge-migration.ts
- shared/revenge-stalemate.ts (new)
- shared/revenge-types.ts
- shared/revenge.ts
- shared/stack-presentation.ts
- shared/topology.ts
- shared/turn-presentation.ts

Tests:

- tests/board-dice-view.test.ts (new)
- tests/gates-teams.test.ts
- tests/revenge-corrections.test.ts
- tests/revenge-dice.test.ts
- tests/revenge-network.test.ts
- tests/revenge-stalemate.test.ts (new)
- tests/revenge.test.ts
- tests/rules-expansion.test.ts (new)
- tests/simulation.test.ts

Delivery notes:

- DELIVERY-RULES-EXPANSION.md (this file)

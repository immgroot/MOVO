# MOVO — KNOCKOUT architecture and current rules

This document describes the preserved KNOCKOUT engines. REVENGE dispatches to
`shared/revenge.ts` and `shared/revenge-collision.ts`; its separate state, dice
sequence, ownership-based captures and support roles are documented in [REVENGE.md](REVENGE.md).
Its version 2 migration (`shared/revenge-migration.ts`) preserves per-piece Halki
history and invaded Home identity without changing the KNOCKOUT save path.

## Audit

The polish pass extends the existing React/TypeScript/Vinext UI, pure rule
engine, Socket.IO room service, guest authentication and SQLite persistence.
It preserves the server authority and recipient projections. Changes remain local.

## Implementation plan

1. **Foundation:** pure TypeScript rules and a data-defined 52-space circuit,
   four 5-space home lanes and exact final destinations; deterministic tests.
2. **Authority:** a separate Node/Socket.IO service. The browser sends intent
   with a request ID and match revision. The service authenticates the guest,
   validates membership, turn and legal moves, rolls with `crypto.randomInt`,
   resolves the complete action and publishes a projection.
3. **State:** rooms own settings, host, members and an optional match. Matches
   own stable piece IDs, position unions, player statistics, dice, six streak,
   turn number, deadline, revision and winner. Modes use a rules interface;
   KNOCKOUT and KNOCKOUT_2V2 use the same rules with explicit team relationships.
4. **Presentation:** an original warm neutral SVG board on a charcoal table.
   Logical space IDs map to visual coordinates. The client displays projected
   legal actions and queues server events separately from authoritative state.
5. **Reconnect:** opaque server-issued guest secrets stored on the device,
   reserved seats, full snapshots on reconnect, no replayed old animations.
   A disconnected seat gets 90 seconds, then forfeits deterministically.
   State and guest credentials are persisted to a local SQLite file.
6. **Responsive:** a board-led desktop composition; compact surrounding player
   badges on portrait phones; board and controls beside each other in short
   landscape viewports. Large legal-piece buttons complement small board tiles.
7. **Motion:** server-calculated hop paths, physical die anticipation/tumble/
   bounce, knock return, mechanical unlock and restrained victory. A cancellable
   client event queue never gates server correctness. Reduced motion preserves
   announcements and final positions.
8. **Verification:** rule and protocol tests, real 2/3/4-client rooms, browser
   interaction tests, responsive screenshots, typecheck, lint, format and build.

## Current rule decisions (rulesVersion 2)

- Four pieces per seat. A 6 opens a piece onto its safe start or moves another
  legal piece. Only a **valid 6 action** awards another roll. No legal move ends
  the turn, including a 6. Knockouts and finishes do not award bonus rolls.
- The third consecutive 6 burns that roll; previous movements remain. A non-6,
  turn change, timeout, or burn resets the streak.
- Home Gates are track indices 50, 11, 24 and 37 for seats 0–3, reached after
  50 steps from the start. A zero-knock piece stops there in HOME_GATE_LOCKED.
  Arrival consumes the move; unused pips are discarded. It cannot use later
  rolls until its owner unlocks Home. It never takes another lap.
- Eight marked Safe Spaces allow mixed occupancy without capture. Gates are
  explicitly excluded from this set. Home Lanes belong to one player and are
  protected from normal enemy interaction. Final Home requires an exact roll.
- Any number of pieces may share a legal space. Occupancy never prevents
  passing. On an exposed landing space, every enemy piece there is knocked
  individually and returned to Base; teammates remain in 2v2. Each victim
  counts as one knock. Shared occupancy provides no extra protection.
- The attacker's first knock permanently unlocks all four of their pieces.
  Waiting gate pieces change to TRACK at the same coordinate and remain
  exposed. They enter the Home Lane only on a future legal roll. Being knocked
  resets a piece to BASE and erases its lap/lock state, without revoking any
  player-level unlock. If gate arrival itself knocks a rival, the arriving
  piece unlocks in place; unused pips still do not advance it further.
- First to secure four pieces wins. A timeout passes the turn without moving.
  A forfeited seat's pieces leave play; the last active player wins by forfeit.
- Turn timers are off, 15, 30, or 45 seconds and restart for each bonus roll.
  All timing is server-owned. Guests may spectate only where enabled.

## KNOCKOUT 2v2

Exactly four connected, ready players are required. Seats 0/2 are Team A and
1/3 are Team B. Turns follow sorted seat order, with normal valid-six bonuses.
The host may randomize seats in the lobby; everyone must ready again. Clients
cannot assign teams or change the mode during a match. Quick queues are separate.

Friendly pieces can share any legal outer space, including a teammate's exposed
gate, without knocking. Enemy capture and safe-space protection are unchanged.
Home unlock is individual: a teammate's knock never unlocks a partner. A player's
4/4 completion skips all their subsequent turns, including an otherwise-earned
six bonus; rolls are never transferred. Team victory requires 8/8 combined Home.
Leaving or exceeding disconnect grace forfeits the seat; in 2v2 this awards the
opposing team a FORFEIT win. Home and forfeit wins remain explicitly distinct.

## Presentation and recovery

Each PIECE_MOVED event carries its origin and ordered logical path. All clients
queue that same path. `PieceToken` uses Web Animations transforms for one hop
at a time (120ms takeoff, 100–105ms middle hops, 140ms final landing). React
updates once per tile, never every animation frame. Knock victims return with
a 460ms arc, followed by count and unlock feedback. Reduced motion uses 45ms
steps without lift while retaining notices and icons. The server never waits
for presentation and the client does not derive legality from animation.

Snapshots preserve mode, teams, explicit gate locks, pending roll and winner.
Reconnect cancels the old animation queue and applies a complete snapshot.
Legacy local matches are migrated once: old zero-knock pieces with completed
lap progress wait at their own gates; obsolete statistics are stripped and the
revision increases. The existing guest secrets and request receipts survive.

## Rule-level unresolved edge case

If every remaining movable piece becomes locked at a gate before its owner
earns a knock, there may be no legal action for anyone. The supplied rules
specify no draw or recovery mechanism. MOVO keeps those pieces locked and
passes unusable rolls; it does not invent an automatic unlock or protection.
This possible stalemate needs a future rule decision.

## Local operational boundary

This is a single authoritative process with local SQLite storage, suitable for
local mixed-device QA. Public hosting, TLS, distributed room
routing, operational monitoring and native clients require a separate rollout.

## Account and presentation polish

`server/auth.ts` mounts Better Auth at `/api/auth/*` on the same Node HTTP server;
the development UI proxies that prefix to port 3001. It owns a separate SQLite
account store and persistent framework sessions. Both backend entrypoints await
schema migrations before exposing account routes. Password hashing, cookie
sessions, Origin/CSRF validation and rate limits belong to the framework. The
HTTP adapter replaces incoming auth-peer headers with the actual socket peer.

React's account client uses same-origin requests. `Account.tsx` supplies optional
guest entry, signup/signin forms, real profile fields, edits and signout. Account
cookies never replace guest tokens or participant IDs. No OAuth or email delivery
provider is configured, and account statistics are not fabricated.

`shared/stack-presentation.ts` derives stable per-square offsets and render order
from immutable piece positions. Local legal movement takes priority, including a
helper's beneficiary. The board chooser only emits an existing legal piece ID;
combat remains entirely server-side. Player cards occupy grid cells outside the
board, with compact top/bottom rows below 980px.

REVENGE uses a server-owned turn pool (`diceFlowVersion: 1`). Every actual roll
has a stable ID, value, immediate bonus parent and consumption status. Collection
continues for each usable six; movement begins when collection ends. A legal move
carries its die ID. Halki activation carries the exact parent/bonus pair and
consumes only those two entries. Optional decline is an authenticated, revision-
checked intent. Only exactly three FINISHED plus one unfinished piece makes a
valid birth compulsory. No-target and declined pairs remain ordinary dice.
Snapshots persist the pool, collection phase and declined choices; migration
retains provable legacy rolls and consumption. KNOCKOUT keeps its separate
single-die engine and third-six behavior.

`shared/turn-presentation.ts` grants visual piece numbers only to the local
REVENGE movement beneficiary during their turn. Stable physical numbers 1–4,
local stack fan-out and linked move controls are presentation only. An active
helper rolls while the beneficiary retains piece choice and local numbers.

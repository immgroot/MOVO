# MOVO — Revenge implementation audit and rule decisions

Status: historical audit, superseded by [REVENGE.md](REVENGE.md) and
[REVENGE-CORRECTION-REPORT.md](REVENGE-CORRECTION-REPORT.md). The latest 66-point
correction pass governs current behavior. The questions and proposed integration
details below record the earlier audit, not current rules.

## Existing architecture audited

| Area                        | Current implementation                                                                                                                                                                                                 | Revenge integration                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application                 | One pnpm package; React 19, TypeScript, Vinext/Vite. The home route and `/join/[code]` render the same `Movo` application.                                                                                             | Extend the existing application and preserve its routes, dependencies and original assets.                                                                                    |
| Local serving               | Development starts UI on 3000 and authority on 3001, with a Socket.IO proxy. The built Node server attaches UI and authority to port 3000.                                                                             | Reuse both entrypoints; no separate Revenge service or deployment.                                                                                                            |
| Board topology              | `shared/topology.ts` defines a 52-space forward circuit, four five-space Home lanes and per-seat finished positions. Starts are 0/13/26/39; Home Gates are 50/11/24/37. Eight Safe Spaces exclude the gates.           | Reuse coordinates and stable space IDs. Add explicit invaded-lane ownership and reverse transitions after the route is defined.                                               |
| Seats and colors            | Four individual colors and glyphs. Seat order is 0 → 1 → 2 → 3. Existing teams use 0/2 and 1/3.                                                                                                                        | Use the same opposite-seat mapping. The brief's example colors are not authoritative team assignments.                                                                        |
| Piece identity              | Four pieces per player, stable IDs derived from player ID and piece number. Position union: BASE, TRACK, HOME_GATE_LOCKED, HOME_LANE, HOME. HOME means fully finished.                                                 | Keep the same sixteen identities. Halki must be an explicit state of an existing finished piece, with no duplicate finished representation.                                   |
| Normal moves                | Six opens onto the start; movement uses a path of logical positions. Home needs an exact roll. With no knock, arrival at the exposed gate clamps movement and loses remaining pips.                                    | Reuse route generation where the Revenge rules permit. Home-lock inheritance needs decision D1 below.                                                                         |
| Dice and turns              | Server uses `crypto.randomInt(1, 7)`. A valid six move earns another roll. No legal move ends the turn, including on six. Third consecutive six burns only that move. Knocks/finishes give no bonus.                   | A single pending `dice` value is insufficient for compulsory Halki. Add a persisted, explicit sequence after D2 is resolved.                                                  |
| Rule engine                 | Pure `createMatch`, `legalMoves`, roll/move/timeout/forfeit resolutions in `shared/game.ts`. The service currently calls these exports directly; `knockoutRules` exists but there is no mode registry dispatch yet.    | Introduce mode dispatch with a distinct Revenge implementation. Preserve the existing KNOCKOUT path and its tests.                                                            |
| Collision                   | On exposed outer landing, capture every enemy; no stacking protection or blocking. Safe Spaces prevent normal capture. Home lanes only have their owner's positions.                                                   | Centralized Revenge collision handling must account for arrivals, departures, prior contest participants, piece type and location. Do not derive outcomes in React.           |
| KNOCKOUT 2v2                | Four players, individual Home unlock, friendly sharing, 8/8 team victory. Finished seats are skipped. Any seat forfeit awards the other team a forfeit win.                                                            | Reuse team identity/progress and the established team-win architecture; do not add helper turns or shields to this mode.                                                      |
| Rooms and lobby             | Server validates mode/capacity; full connected ready seats are required. Host controls start, team randomization, transfer, removal and rematch. Quick queues are separated by mode.                                   | Register REVENGE in validation, quick queues and lobby labels, forcing four seats at every entry point.                                                                       |
| Mode selection              | Two working mode cards and one disabled future-mode slot in `Movo.tsx`.                                                                                                                                                | Replace the future slot with REVENGE only when the mode works. Include its tagline, HALKI signature, Play and direct How To Play entry.                                       |
| Identity and auth           | Server-issued opaque guest credentials, hashed in SQLite; per-tab sessionStorage credential. No account sign-in integration exists.                                                                                    | Reuse guest authority. Player names are display data; never use them for authorization or collision ownership.                                                                |
| Multiplayer                 | Socket.IO intents carry protocol version, request ID, match ID and revision. Server validates membership/turns and publishes recipient-specific legal moves.                                                           | Add only the needed intents, using server-recalculated legal actions. Never accept client dice, strength, team, countdown or unchecked destinations.                          |
| Reconnect/persistence       | Complete room/match snapshots and request receipts persist in local SQLite. Reconnect restores pending dice and pieces. Disconnect reserves a seat for 90 seconds. Existing migration handles old KNOCKOUT gate state. | Persist Halki, contests, dice stages, permanent finish and support state. Guard legacy migration by mode/version; do not rewrite KNOCKOUT saves into Revenge.                 |
| Spectators                  | Watch enabled rooms, no seat and no gameplay actions. Recipient projection returns no legal pieces.                                                                                                                    | Preserve viewing and gameplay denial. The application has no spectator chat privilege to inherit.                                                                             |
| Match controls              | Both roll and move controls currently require `currentPlayerId === selfId`.                                                                                                                                            | Helper mode needs separate roll actor and piece beneficiary. The helper rolls; only the beneficiary selects their own piece.                                                  |
| Presentation                | `use-game.ts` separates authoritative snapshots from the display queue. Server events carry full paths and knock origins. Reconnect cancels stale animation.                                                           | Extend typed events for activation, shield/contest changes, automatic kills and support readiness. Preserve atomic server state while showing the requested ordered sequence. |
| Board rendering             | Original SVG board, stable piece IDs, occupant offsets, memoized tokens and per-hop Web Animations transforms. No per-frame React position updates.                                                                    | Reuse tokens and motion. Add mode-scoped Halki rings, shield/contest indicators and target affordances, retaining individual colors.                                          |
| Responsive UI               | Board-led desktop and portrait layouts; landscape places board beside controls. Large legal-piece buttons complement small tiles.                                                                                      | Keep status compact; chat collapses and opens as a secondary panel/sheet. Verify new states at all eight requested sizes.                                                     |
| Tutorial                    | Existing dialog, ten visual lessons, replay, back/next, swipe and reduced motion. Scenarios use the real KNOCKOUT engine.                                                                                              | Add KNOCKOUT, KNOCKOUT 2v2 and REVENGE tabs in the existing guide. Revenge examples must use its actual resolved rules and engine.                                            |
| Sound                       | Existing synthesized tactile effects, mute/master/effects controls, optional haptics and reduced motion.                                                                                                               | Extend semantic sound hooks using the existing sound system; no new media dependency is necessary.                                                                            |
| Chat/reactions              | No existing chat messages, intents, panels, persistence policy or reaction system. Socket-wide action throttling exists.                                                                                               | Add room-scoped, bounded plain text and allowlisted reactions with dedicated server limits. Keep spectator sending disabled and avoid permanent chat storage.                 |
| Tests and QA                | Five Vitest files cover rules/topology, gates/teams, real sockets, SQLite restart and complete seeded games. Isolated visual fixtures use a separate database/port; built-server smoke uses four real clients.         | Reuse the test/fixture infrastructure. Extend it for Revenge; existing KNOCKOUT evidence is not Revenge evidence.                                                             |
| Documentation and workspace | README, ARCHITECTURE and DELIVERY describe the current KNOCKOUT implementation and its limitations. No `.git` directory was found in this workspace. Sites configuration exists with no D1/R2 binding.                 | Add distinct Revenge documentation and the requested implementation report once implemented. No commit, push, merge or deployment.                                            |

## Defined Revenge requirements

The following requirements are clear and do not need to be redesigned:

- Exactly four players, opposite teammates and normal seat rotation.
- Same-color stacks give no shield; mixed teammate colors create Team Shield.
- Normal enemies can pass and land on a shield. Landing produces a persistent
  contest. The specified single-enemy examples resolve through shield break or
  defending-team reinforcement.
- Only a currently fully finished piece is eligible for activation. It keeps its
  identity, becomes Halki and stops counting as finished.
- Enemy Home mapping is exact: Home 1/2/3/4/5 requires bonus 5/4/3/2/1.
- A valid eligible 6-plus-bonus Halki attack is compulsory before permanent 4/4.
- Halki kills one or two normal defenders, including a two-piece Team Shield;
  it cannot partially kill a three-piece stack. A waiting Halki kills when the
  specified three-normal-defender contest reduces to two.
- Halki overrides Safe protection and can attack inside enemy Home. That Home's
  owner cannot kill it there. A Halki killed on ordinary track returns to Base
  as a normal piece, needs six to reopen and must finish the full journey again.
- Reaching actual 4/4 permanently secures all four pieces and disables Halki.
  Support waits four complete rotations, not four individual turns. Then the
  finished seat recurs as helper: helper rolls, teammate chooses the move.
- Team victory uses actual finished pieces, never active Halki.
- Room chat, allowlisted reactions, an integrated visual tutorial, reduced
  motion and the requested responsive/reconnect/spectator QA are in scope.

## Decisions needed before rule implementation

These are missing transitions or reachable interactions, not requests for
permission to perform the already-authorized implementation.

### D1 — Does Revenge require a knock to enter normal Home?

Sections 11–14 say normal pieces play normally and reuse MOVO opening, but do not
state whether Revenge inherits KNOCKOUT's individual knock requirement and locked
Home Gate. That requirement is central to the existing engine and tutorial.

Decision needed: retain the individual one-knock gate rule, or allow normal Home
entry without a knock in Revenge? KNOCKOUT retains its current rule either way.

### D2 — Exact six-plus-bonus action sequence

Sections 42–45 describe activation on six followed by a movement bonus. Sections
58–60 make activation compulsory only after the bonus reveals a valid attack.
The existing engine requires spending a roll before the next roll, so it cannot
determine future compulsory activation without an explicit different sequence.

Decision needed:

- With an eligible finished piece, does the server reserve the six and request
  the bonus before permitting any piece movement or activation choice?
- If that bonus creates no valid attack, is activation still allowed? Which
  dice can be spent on normal pieces, and in what order?
- How does 6 + 6 work, and when does the existing third-six burn apply to this
  sequence? Does the bonus six arm another activation or have another use?

This also determines helper-turn sequencing and the required reconnect fields.

### D3 — Complete Halki route and living lifecycle

Sections 46–57 define reverse direction and Home distances, but not the complete
route from the owner's finished position into an opponent's lane. The current
board has separate seat-specific finished positions and no link between them.

Decision needed: provide one ordered route from FINISHED through activation,
enemy Home 5 → 1, the outer-track exit and subsequent reverse movement. State
whether either opponent's Home can be chosen, where a bonus six lands, and how
an existing track Halki can enter another Home later. If multiple attacks are
possible, specify who chooses the opponent/target.

Also define how a Halki that stays alive becomes finished again, if it can. The
brief describes recovery after death but no living return-to-finish transition.
Without that transition, a surviving Halki could prevent its owner's 4/4 forever.

### D4 — Legal Halki moves when no kill is available

Compulsory activation for a valid attack is clear. Legal activation onto an empty
space or a stack too large to kill is not defined. Section 71 permits contesting
three defenders only “if game state allows” sharing, without specifying when.

Decision needed: may the player activate without an immediate kill, including
against a three-piece stack? On later turns, may they choose freely between a
normal piece and an existing Halki, or are available Halki attacks compulsory?

### D5 — Collisions outside the specified normal-defender examples

The brief defines Halki attack strength against normal pieces, but does not
define defending Halki strength or interactions between multiple Halki.

Decision needed: what happens when an enemy Halki lands on another Halki or on a
mixed normal/Halki stack? Can a friendly Halki count as one of the two teammate
colors creating Team Shield?

Another reachable state is Team A's mixed shield with one Team B piece waiting,
followed by the other Team B color arriving. Both teams now have mixed colors.
Does that arrival remain as a mutual contest, capture anyone, or become illegal?
Define priority when an arrival would otherwise trigger both reinforcement and
Halki collision rules. These outcomes cannot be derived from the single waiting
normal-enemy examples without choosing a new rule.

## Implementation structure after decisions

1. Register mode dispatch and typed Revenge state. Retain separate KNOCKOUT
   execution and save compatibility. Force four seats in room creation, quick
   queues and match creation.
2. Implement the resolved dice/activation stages, complete reverse route and
   one centralized atomic collision resolver. Compute legal action identifiers
   on the server; preserve all piece identities.
3. Implement permanent finish, persisted full-rotation progress and helper
   authorization with distinct roll actor/beneficiary. A bonus roll must not be
   counted as a completed rotation.
4. Extend recipient snapshots, reconnect and request deduplication for every
   new phase. Add room-scoped chat and reactions without changing KNOCKOUT.
5. Integrate mode card, team/helper status, legal Halki/target selection,
   collision visuals, animation events and tutorial tabs into the existing UI.
6. Add deterministic rules, network authorization, persistence and regression
   tests for the brief's examples and the decisions above. Then perform actual
   four-client/browser, reconnect, spectator and responsive QA and report its
   limits explicitly.

## Verification performed during this audit

| Check                                   | Result                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Existing automated tests                | 104 passed across five files; includes real Socket.IO integration and SQLite restart tests.            |
| Typecheck                               | Passed.                                                                                                |
| Lint                                    | Passed.                                                                                                |
| Existing local preview                  | `http://localhost:3000/` returned HTTP 200 with MOVO content.                                          |
| Existing realtime endpoint              | Engine.IO polling handshake returned HTTP 200 and an opening packet.                                   |
| Revenge implementation/tests/browser QA | Not performed; awaiting rule decisions.                                                                |
| New production build                    | Not run during this audit; application source was not changed. The existing built preview was checked. |
| Git diff check                          | Unavailable: this workspace has no Git repository/baseline.                                            |

Only this audit document was added. The current preview remains available. The
previous `DELIVERY.md` is the KNOCKOUT polish report and does not certify Revenge.
The existing all-locked-gate stalemate remains a documented KNOCKOUT rule issue;
no recovery rule was invented here.

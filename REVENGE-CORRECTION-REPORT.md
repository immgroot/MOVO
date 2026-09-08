# MOVO Revenge — correction pass

Implemented the supplied 66-point correction pass in the existing mode.
The prior 188-test delivery remains a historical baseline. No tests were removed.

## Behavior changed

1. **Knock to unlock Home.** New Revenge players start locked. A zero-knock
   normal piece stops at its actual exposed Home Gate after its lap, loses any
   remaining pips, and cannot move or start another lap. A kill by any of that
   player's pieces permanently unlocks all four; waiting pieces stay on their
   square until a later legal roll.
2. **Same-owner stacks can be captured together.** The normal collision rule
   now inspects ownership and shield composition. A normal attacker captures
   one through four unshielded same-owner normal pieces together. It also
   receives no invented protection exception for a same-owner normal/Halki mix.
   Safe Spaces and Home-owner immunity still apply.
3. **Halki can contribute to teammate shields.** Both teammate owners must be
   represented. A normal+teammate-Halki shield protects against normal and Halki
   attacks. Teammate Halki+Halki follows the same ownership-based shield rule.
   Same-owner normal+Halki has no shield. Ordinary normal+normal teammate shields
   remain defeatable by Halki when they contain at most two physical defenders.
4. **Halki still captures at most two.** No partial capture from three or more.
   Departures re-evaluate the remaining composition; reducing three to two
   cannot bypass a surviving teammate Halki shield. The same capture predicate
   checks compulsory birth targets, so protected Home occupants cannot create
   a Halki.
5. **One Halki life per physical piece.** New pieces explicitly start unused.
   Successful birth sets `hasUsedHalki` permanently. Survival, death, reopening
   from Base, and a later normal Finish never reset it. Only unused finished
   pieces from an owner below permanent 4/4 can activate.
6. **Return through the original invaded Home.** Birth stores the enemy Home
   owner on that specific piece. After exiting that lane, Halki walks a full
   52-square reverse outer lap, re-enters the same enemy Home, and finishes
   exactly through that lane. Two Halkis can remember different enemy Homes.
   Active status ends at Finish; the used-life flag remains.
7. **UI and guide updated.** The existing 16 lessons now cover the corrected
   gates, stack ownership, Halki shields, one-life eligibility and full reverse
   route. Board/seat labels show locked Home, used-life markers and protected
   shields. Used finished pieces are excluded from activation controls.

The four-seat/opposite-team setup, normal movement, dice and third-six behavior,
exact finishing, compulsory valid activation/active Halki kills, Home mapping,
Safe behavior, death to Base, permanent 4/4, four-rotation support and helper
authorization remain. Chat, reactions, spectator restrictions, reconnect grace,
team forfeits, animations and KNOCKOUT behavior remain in their existing paths.

## Files changed in this pass

| Area          | Files                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engine/data   | `shared/game.ts` (Revenge-only piece metadata), `shared/topology.ts` (target Home on Halki positions), `shared/revenge-types.ts`, `shared/revenge.ts`, `shared/revenge-collision.ts` |
| Persistence   | New `shared/revenge-migration.ts`; `server/service.ts` loads migrated Revenge state                                                                                                  |
| Client        | `components/game/Board.tsx`, `Movo.tsx`, `Tutorial.tsx`, `RevengeTutorial.tsx`                                                                                                       |
| Tests         | `tests/revenge.test.ts`, `revenge-network.test.ts`, `simulation.test.ts`; new `revenge-corrections.test.ts`                                                                          |
| Local QA      | `qa/polish-server.ts`; refreshed `qa/production-smoke-revenge.json`                                                                                                                  |
| Documentation | `REVENGE.md`, `README.md`, `ARCHITECTURE.md`, historical notices in `DELIVERY-REVENGE.md`/`REVENGE-AUDIT.md`, this report                                                            |

## Existing test expectations updated

| Superseded expectation                                                  | Corrected retained coverage                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Revenge Home starts unlocked; no knock needed                           | Locked by default; all four seat routes stop at their Home Gate                                     |
| Normal cannot capture two same-owner defenders                          | Entire unshielded same-owner stack is captured                                                      |
| A defending same-owner normal/Halki mix gains physical-count protection | Same-owner mix remains unshielded and capturable                                                    |
| Halki does not contribute to Team Shield                                | Both teammate owners create shield, including Halki                                                 |
| Shield loss protects a remaining same-owner double from a normal        | The remaining unshielded same-owner stack is captured                                               |
| Surviving Halki ends through its owner's Home                           | Eight seat/target route cases finish through the original enemy Home, with a full 52-step outer lap |
| Killed Halki may finish normally and activate again                     | Death/reopen/full forward finish preserves its used flag and excludes a second activation           |
| Simulated Revenge Home is always unlocked                               | Unlock agrees with recorded captures, including all four seeded Revenge matches                     |

Added **26 focused correction cases** for 1–4 same-owner captures, shield
composition/Safe/departure interactions, protected activation rejection, gate
blocking/unlock, actual births and independent targets, full reverse paths,
used-piece rejection, and old-state migration. The retained restart test now
also asserts inactive used history, two active target identities, reverse
progress, a zero-knock locked gate and a teammate Halki shield, alongside its
existing dice, support, identity and ephemeral-chat checks.

## Verification

| Check                                                          | Result                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Full `pnpm test`                                               | **214 passed, 8 files**                                                                       |
| Revenge-specific files                                         | **106 passed, 3 files**                                                                       |
| KNOCKOUT/shared regression files, including seeded simulations | **108 passed, 5 files**                                                                       |
| `pnpm typecheck`                                               | Passed                                                                                        |
| `pnpm lint`                                                    | Passed                                                                                        |
| `pnpm format:check`                                            | Passed                                                                                        |
| `pnpm build`                                                   | Passed                                                                                        |
| Production Revenge smoke                                       | Four real Socket.IO clients, 40 actions, reconnect, identical state; HTTP pages/assets passed |
| `git diff --check`                                             | Attempted; unavailable because this workspace has no `.git` repository                        |

Browser checks used the production UI with an isolated local fixture authority
on port 3002, one visible GROOT browser and three real Socket.IO peers. Fixture
positions seed specific cases; the visible browser uses normal server actions.
No fixture controls or fabricated players were added to the production service.

| Requested browser check          | Observed result                                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1. Zero-knock arrival            | Stops at gate index 50 in `HOME_GATE_LOCKED`                                                                  |
| 2. Lock indicator                | Piece lock badge, NEED 1 KNOCK and HOME LOCKED message visible                                                |
| 3. Other piece unlock            | Capture changes waiting piece to movable track at the same index 50; Home open label appears                  |
| 4. Same-color double             | Both KIV defenders return to Base; normal GROOT earns two knocks                                              |
| 5. Normal+normal teammate shield | Both defenders remain; contested Team Shield marker appears                                                   |
| 6. Normal+teammate Halki shield  | Both defenders remain against normal attack; Halki-protected marker appears                                   |
| 7. Halki attacks that shield     | Both defenders and attacking Halki remain; no capture                                                         |
| 8. Same-owner normal+Halki       | No shield marker; attacking Halki captures both and victim's used history remains                             |
| 9. First activation              | 6+4 forces the Home 2 choice; selected piece becomes Halki, records KIV and used=true, victim returns to Base |
| 10. Used finished eligibility    | Used Piece 1 has used-life label; only unused Piece 2 is offered for the matching Home kill                   |
| 11. Original Home return         | Reverse step reaches KIV Gate at travelled=52, then KIV Home 1 and Home 2; owner remains GROOT                |
| 12. Refresh                      | Same piece ID, invaded owner, used flag and returning Home position restored exactly                          |

All sixteen tutorial scenes rendered without browser errors. The route lesson
was observed reaching its final KIV Finish after the full reverse circuit.
Phone board and guide at 390×844 fit without horizontal overflow; the desktop
board, updated markers and controls were also inspected.

## Compatibility and limits

Old snapshots without lifetime history cannot prove unused eligibility. Those
pieces conservatively become ineligible for a new Halki activation. Old Home
unlock defaults are reconstructed from recorded kills; pieces already in Home
keep their saved position. Original invaded targets are recovered only where
the stored lane or reverse progress proves the target. An unprovable active
route/committed activation pauses with a new-match explanation. New matches
initialize all corrected metadata. This avoids silently granting extra lives
or assigning the wrong finish lane to a saved Halki.

The same-owner normal/Halki interpretation follows corrections 1 and 30's
unshielded same-owner capture rule. Teammate Halki+Halki follows corrections 23
and 31's requirement that both owners may contribute either piece type.

No commit, push or deployment was performed. The refreshed normal preview uses
port 3000. The local fixture service is stopped after verification.

# REVENGE dice flow and turn UI

Verified 8 September 2026. Continued the existing implementation without rebuilding
REVENGE. This report supersedes historical dice-flow and compulsory-birth wording
in DELIVERY-POLISH.md. No commit, push, or deployment was performed.

The completed pass adds a real turn-dice pool, optional versus last-piece-required
Halki choices, clearer turn cards and stable local piece numbers. Final verification
also corrected the selected-die hint, compact die pips and crowded Finish badges.

1. **Dice architecture:** The old single current die, activation value and queued
   values are replaced as the source of truth by server-owned `turnDice` entries:
   stable ID, value, immediate `bonusOf` parent and consumption status. Collection
   ends before movement choices are presented. Legacy compatibility fields remain;
   migration tests cover older saved turns.
2. **6 + 4:** Two ordinary movement values. A six can open a Base piece and the
   four can move it, or dice can move different pieces in either legal order.
3. **6 + 6 + 4:** Three real results. Browser QA observed all three, then spending
   the first six changed only that die to USED.
4. **Unlimited sixes:** Every usable six earns another roll. No third-six burn.
   Automated cases exercise chains through eight consecutive sixes.
5. **Dice UI:** TURN ROLLS displays available, used, Halki-consumed, unplayable and
   turn-ended values. Players select an available die, then a legal piece. The
   previous turn remains visible after advancement. Movement hints now follow
   the selected die rather than the first remaining die.
6. **Candidate pairing:** A six pairs only with its immediately following bonus.
   In 6A → 6B → 4, Home 2 activation uses 6B + 4. No replacement rolls.
7. **Optional Halki:** Eligible normal opportunities show HALKI AVAILABLE, target
   buttons and Play dice normally. Browser-tested with two finished pieces.
8. **Required Halki:** A valid final-piece opportunity shows HALKI REQUIRED and
   removes normal movement/decline choices. Server validation rejects bypasses.
9. **Exact condition:** Four physical pieces, exactly three currently HOME and
   one not HOME, plus an unused eligible finished piece, available matching pair
   and killable enemy Home target. Permanent 4/4 disables activation.
10. **Decline:** Records the declined pair without consuming it, changing the
    finished piece, spending its Halki life or attacking the target. Browser QA
    confirmed the panel closes with both six and four still available.
11. **Accept:** Consumes only the chosen pair, activates the selected physical
    piece and performs the capture. Browser QA confirmed 6A stays AVAILABLE while
    6B and four become HALKI-consumed.
12. **Multiple targets:** Server legal moves enumerate target and eligible piece
    combinations. Optional players may decline; required players choose a target.
    Both conditions have automated multiple-target coverage.
13. **Active cards:** REVENGE-specific active border, glow and turn chip distinguish
    the current player, while other cards remain readable.
14. **Turn-start cue:** A brief YOUR TURN cue is keyed to match and turn. Observed
    in the live browser fixture.
15. **Piece highlighting:** Legal pieces receive emphasis and draw above inactive
    pieces on contested squares. Presentation does not mutate board occupancy.
16. **Stable numbering:** Physical `piece.number + 1` stays fixed through Base,
    finishing, Halki activation and death. All four seats have automated coverage.
    Local Finish slots spread apart, with number badges facing inward so nearby
    track pieces do not obscure them. Final mobile measurements found no number
    badge overlap in the three-finished-piece fixture.
17. **Local labels:** Only the local acting beneficiary sees its own numbered
    pieces. Spectators and other players receive no visual number badges. During
    support, labels belong to the teammate who moves. Browser QA confirmed four
    local labels disappear when the turn advances to KIV.
18. **Stack fan-out:** Local pieces receive wider visual offsets and legal pieces
    draw in front. Authoritative square positions and IDs remain unchanged.
19. **Button/board linking:** Pointer and keyboard focus connect move controls to
    the matching physical piece. Browser keyboard focus on Move piece 2 marked
    the board token bearing number 2.
20. **Mobile selection:** At 390×844, tapping a selectable stack opens a compact
    picker. Piece 1 and Piece 2 buttons measured 136×44px; choosing Piece 2 executed
    the move. No hover is needed.
21. **Responsive cards:** Final-build measurements at 390×844, 900×700, 1024×768,
    1280×720 and 1440×900
    found no horizontal overflow or player-card/board overlap. Settled board
    widths were 355px on mobile and 540px on desktop. Mobile required-Halki
    controls and desktop active-card styling were also inspected visually.
22. **How to play:** The 18-scene REVENGE guide explains real turn dice, 6 → 6 → 4,
    optional decline, the last-piece requirement and no-target normal play.
    Every scene resolves through the engine in automated tests.
23. **Tests:** Dice-pool, exact-pair consumption, decline, compulsory activation,
    forged/reused dice, helper turns, migration, numbering and stack-presentation
    coverage is present. The historical polish report recorded 252 tests; the
    completed workspace has 282: 30 additional passing cases overall.
24. **REVENGE regression:** All dice, correction, lifecycle, collision, network,
    persistence, presentation and migration tests pass.
25. **KNOCKOUT regression:** Existing rules, gate/team, multiplayer and simulation
    suites pass. No KNOCKOUT rule was changed in this continuation.
26. **Final count:** 282 passed, zero failed, across 13 files. Machine-readable
    results are saved in `qa/dice-flow-tests.json`.
27. **Typecheck:** `pnpm typecheck` passed after the final badge correction.
28. **Lint:** `pnpm lint` passed after the final correction.
29. **Build:** `pnpm build` passed after the final correction. Vinext retains its
    informational static route-classification limitation for `/`.
30. **Diff check:** Attempted `git diff --check`; unavailable because this folder
    has no Git repository. No repository was initialized. Formatting was checked
    separately with `pnpm format:check`.
31. **Browser QA:** Performed in Chromium through the in-app browser against the
    isolated production fixture on port 3002 with three real Socket.IO peers.
    Checked normal pool, optional decline, required state, exact-pair accept,
    keyboard linkage, mobile stack picker, local label removal and responsive
    layout. The final build was checked again for compact pips, Finish badges,
    selected-die hints, required multi-target selection, keyboard linkage and
    mobile stack selection. Choosing Piece 4 and NOOR correctly activated that
    physical piece in NOOR Home 2. All four pips fit inside the compact die.
    Final layout measurements are saved in `qa/dice-flow-browser.json`.
    No physical-phone, Safari or Firefox testing is claimed. Four-seat numbering
    and exhaustive target permutations have automated coverage. An earlier
    browser usage-limit rejection was resolved when verification resumed.
32. **Remaining limits:** No newly discovered gameplay issue remains from this
    continuation. Previously documented unrelated KNOCKOUT Home-Gate stalemate
    behavior remains outside scope. Git-based comparison is unavailable. Browser
    QA did not repeat every historical chat, auth, spectator or support scenario;
    their automated regression coverage passes.

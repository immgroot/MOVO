# MOVO — Revenge, accounts and presentation correction pass

Completed locally on 6 September 2026, continuing the existing implementation.
No commit, push or deployment. This report supersedes older delivery reports for
six-chain behavior, account availability and stack/player-card presentation.

1. **Unlimited six behavior:** Every usable Revenge six keeps its movement and
   next roll. Five consecutive sixes were exercised in the browser; tests also
   cover eight. The chain ends through ordinary turn rules, never a six-count cap.
2. **Three-six penalty removed:** Revenge no longer emits a third-six burn or
   ends the turn for reaching three sixes. KNOCKOUT's separate penalty remains.
3. **Multi-six coverage:** Tests cover one, two, three, four, five and eight ordinary
   sixes, plus five-six helper and held-bonus sequences. Previous movement survives.
4. **No-target Halki behavior:** Empty, three-defender and protected Home targets
   do not hold a six or consume an unused finished piece. Five no-victim sixes
   passed in the browser with `awaitingBonus=false`, no activation, and the
   finished piece's lifetime still unused. Empty Home 2 does not require 6+4.
5. **Valid interruption:** A real killable KIV Home 2 victim plus an unused finished
   piece and 6+4 produces only activation choices. The visible target button was
   used: KIV returned to Base, GROOT became Halki in that Home and used its one life.
6. **6+6 handling:** The existing sequential queue is retained. If a Home kill is
   possible, one six waits for its bonus. A second six creates no Home 6: the
   earlier six becomes normal movement, then the queued six is evaluated. In the
   browser, 6,6,6,6,4 preserved three six movements before the held six paired with
   four. No new pairing rule or ambiguous state was introduced.
7. **Stack architecture:** A pure presentation helper groups by existing square
   IDs, calculates stable offsets and sorts drawing order. Two pieces separate
   sideways, three form a triangle, and larger groups use a compact grid.
8. **Active-player z-order:** Legal local pieces render last, including the moving
   teammate during support. Other occupants retain their offsets. Turn changes
   do not replay gameplay movement. Legal rings do not pulse continuously.
9. **Desktop selection:** Clicking a shared legal stack opens a compact chooser.
   Selecting Piece 2 moved only Piece 2; the remaining occupants and shield stayed.
10. **Mobile selection:** The same chooser has 44px buttons. At 360×800, the final
    stacked-piece hit areas measured 47.5×47.5px. A real pointer selection moved
    the selected piece. Physical phone/touch hardware was not used.
11. **Responsive cards:** Cards now occupy grid cells outside the board. Details
    compact on laptops; below 980px, dedicated top/bottom rows preserve identity,
    team and essential status. An old Halki-only rule shrinking laptop boards to
    214px was overridden; the 1280×720 board now measures 380px.
12. **1280×720:** Passed: no card/board/dice/target overlap or horizontal overflow.
13. **1024×768:** Passed; 428px board with compact side cards.
14. **Narrow desktop:** 1152×720, 900×700 and 800×700 passed, together with ten
    intermediate resize widths including both sides of the 980px breakpoint.
15. **390×844:** Passed; 355px board with compact card rows. 430×932 and 360×800
    also passed. Tall content may scroll vertically; cards never cover the board.
16. **Guest flow:** Play/Create offers Continue as guest, Sign in, Create account.
    Guests created a real four-player Revenge table without an account. Joining
    and reconnecting remain covered by the multiplayer suites and production smoke.
17. **Sign Up:** Real display name/email/password/confirmation form, client and
    server validation, persistent Better Auth account creation and automatic sign-in.
    Empty-name and confirmation mismatch errors were exercised in the browser.
18. **Sign In:** Real email/password authentication. Empty/invalid inputs and wrong
    credentials were checked; incorrect credentials show “Invalid email or password.”
    Unknown backend errors are mapped to concise connection errors.
19. **Profile:** Actual name, initial avatar, email, creation date and verification
    status. Name edits persist and update the menu. No invented game statistics.
    Signup during an active guest match preserved its seat, room and revision.
20. **Sign Out:** Invalidates the server session and restores guest UI. Signing out
    and back in during a match preserves the table identity. Refresh retained both
    the authenticated session and the unchanged match.
21. **Google auth:** Not configured; no fake button or live OAuth claim.
22. **Discord auth:** Not configured; no fake button or live OAuth claim. Email
    verification and password-reset delivery also require a future mail transport.
23. **Creator credit:** Public footer shows “Created by @immgroot” and “Discord
    @immgroot”, including small screens. It is separate from gameplay identities.
24. **How To Play:** The 16-step Revenge guide teaches unlimited sixes, no-target
    normal play, reverse Home mapping, compulsory valid activation and stack
    priority. The five-six example was replayed to its “ROLL AGAIN” ending; the
    stack lesson displayed two legal pieces in front. Prior corrected rules remain.
25. **Revenge regression:** All Revenge tests and complete-match simulations pass.
    Preserved Home locking, teammate/Halki shields, same-owner captures, once-per-
    piece Halki, same-invaded-Home return route, permanent 4/4 and four-rotation support.
26. **KNOCKOUT regression:** The five-file rules/network/persistence/simulation
    subset passed all 108 checks (includes shared and Revenge simulations).
    Both KNOCKOUT modes passed separate four-client production smoke runs.
27. **Chat/reactions:** Existing automated checks pass. After account sign-in, a
    browser chat message still used GROOT's room identity and a clap reaction was
    accepted. The isolated fixture's other participants were synthetic QA clients.
28. **Reconnect:** Account tests preserve guest reconnect IDs across auth changes.
    Browser refresh retained the exact seat, room and match revision. Production
    smoke passed reconnect and state equality for all three game modes.
29. **Tests changed:** Added 12 dice, 11 stack-presentation and 15 account tests.
    Updated Revenge's former third-six and empty-target expectations and its
    restart fixture. Existing KNOCKOUT gameplay assertions were retained.
30. **Final count:** **214 → 252 tests**, an increase of **38**, across 11 test files.
    All pass. Account tests cover hashing, cookie attributes, invalid credentials,
    validation, profile authorization, cross-origin rejection, rate limits with
    forged headers, service restart, signout invalidation and separate game identity.
31. **Typecheck:** `pnpm typecheck` passed.
32. **Lint:** `pnpm lint` passed.
33. **Build:** `pnpm build` passed. All three production smoke runs passed HTTP
    pages/assets, four real Socket.IO clients, 40 actions, reconnect and state
    equality. The final local preview is served on port 3000.
34. **Diff check:** `git diff --check` was attempted but unavailable: the workspace
    is not a Git repository. No repository was initialized. Formatting is checked
    separately with `pnpm format:check`.
35. **Remaining bugs/limits:** No newly introduced bug remains known from this
    pass. The previously documented KNOCKOUT stalemate when all remaining pieces
    are locked at Home Gates still requires a gameplay rule decision; it was not
    changed. Accounts are local and single-server; game statistics and guest-stat
    migration are deferred. Auth LAN use requires `BETTER_AUTH_URL` to match the
    actual origin. Hosting/TLS and external providers remain outside this pass.
36. **Browser coverage limits:** QA used the available Chromium in-app browser
    with viewport overrides, not native Chrome window dragging, physical phones,
    Safari or Firefox. Signup, signin and profile were measured at all three auth
    sizes; guest creation, signup, signin, profile edits and signout were exercised.
    Not every old tutorial animation, support scenario or spectator flow was
    replayed visually; those retained their automated regression coverage. No live
    OAuth, mail delivery, cross-device LAN account flow or public HTTPS rollout
    was tested or claimed.

## Recorded browser layout checks

All rows had **zero card overlap** with the board, die or compulsory Home target
controls, and **no horizontal page overflow**. The board rectangle includes all
Home lanes and pieces. Checks used a live compulsory-Halki fixture, with normal
stack interaction tested separately.

| Viewport | Board width | Cards                     |
| -------- | ----------: | ------------------------- |
| 1440×900 |       540px | Side columns              |
| 1280×720 |       380px | Side columns              |
| 1152×720 |       380px | Compact side columns      |
| 1024×768 |       428px | Compact side columns      |
| 900×700  |       370px | Dedicated top/bottom rows |
| 800×700  |       370px | Dedicated top/bottom rows |
| 430×932  |       395px | Compact top/bottom badges |
| 390×844  |       355px | Compact top/bottom badges |
| 360×800  |       325px | Compact top/bottom badges |

Intermediate widths, all at 720px high: **1360, 1240, 1180, 1100, 1000, 980,
960, 920, 880, 840**. Each resize was followed by a separate settled measurement.

| Account view | 1440×900           | 1024×768                       | 390×844            |
| ------------ | ------------------ | ------------------------------ | ------------------ |
| Sign Up      | Pass, 480px dialog | Pass, internal vertical scroll | Pass, 343px dialog |
| Sign In      | Pass, 480px dialog | Pass, 480px dialog             | Pass, 343px dialog |
| Profile      | Pass, 480px dialog | Pass, 480px dialog             | Pass, 343px dialog |

All account inputs measured at least **48px high**. All nine form layouts had no
horizontal overflow. Synthetic local QA accounts were used.

## Account implementation and local operation

The repository had no existing account provider. This pass uses
[Better Auth](https://better-auth.com/docs/installation) and its
[SQLite adapter](https://better-auth.com/docs/adapters/sqlite), rather than
implementing password hashing or sessions manually. `server/auth.ts` mounts the
framework on the existing Node server. It uses a separate SQLite account database,
framework-managed password hashes, HttpOnly/SameSite cookies, explicit origin and
CSRF checks, database-backed limits and no cached browser session payload.

The normal guest/reconnect protocol is unchanged. Account cookies are not guest
credentials and do not grant ownership of a game seat. Session lifetime is seven
days with framework renewal; logout invalidates the stored session. HTTPS URLs
enable Secure cookies. Local startup generates a retained secret when an
environment secret is absent. See `.env.example` and README for configuration.

The isolated QA runner uses port 3002, separate game/account databases and its own
cookie prefix. Deterministic starting positions and dice are controlled through
a local file; production has no fixture endpoint and retains random server dice.
The QA runner is stopped after verification; the regular port-3000 preview stays.

# Historical report

Dice collection and compulsory-birth statements below describe the earlier pass.
[DELIVERY-DICE-FLOW.md](DELIVERY-DICE-FLOW.md) supersedes them with the real turn
pool and optional/last-piece-required Halki choices. Account and layout work
described here remains in place.

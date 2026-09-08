# MOVO · KNOCKOUT + KNOCKOUT 2v2 + REVENGE

**No knock. No home.** A local-first implementation of the browser multiplayer
game in the supplied build brief. Original SVG board and pieces, real rooms,
server-generated dice, persistent guest seats, and a standalone rules engine.

## Run locally

Requires **Node 24+** and **pnpm 11**.

```sh
pnpm install
pnpm dev
```

Open **http://localhost:3000**. The development command starts both the UI on
3000 and the authoritative room service on 3001. Create a room, share its code,
and ready every seat before the host starts. Quick play joins a real public
waiting room or creates one; it never fabricates opponents.

Choose KNOCKOUT for 2–4 players or KNOCKOUT 2v2 for four players in opposite-seat
teams. Both use individual Home unlocks. A piece reaching Home Gate without a
knock stops there and remains exposed. Stacking never stops other pieces from
passing or provides protection. The visual How To Play covers the exact rules.

REVENGE is a separate four-player team mode: **Winning isn’t safe.** Home entry
needs a knock; a zero-knock piece waits at its Home Gate. Normal attackers can
capture an entire same-owner stack. Mixed teammate ownership creates a shield;
including a teammate Halki also protects it against Halki attacks. Each physical
piece can become Halki only once, through a matching enemy Home kill.
Halki makes a full reverse outer lap and finishes through that same invaded Home.
Permanent 4/4 completion unlocks teammate support after four full rotations.
Consecutive sixes are unlimited in REVENGE. Collect the real roll chain, then use
each available die on a legal piece. Six plus four is two playable dice; six,
six, four is three. A Halki uses only its six and immediate matching bonus.
Activation is optional unless exactly three pieces are finished and one remains
unfinished. Declining an optional attack leaves both dice available normally.
See [REVENGE.md](REVENGE.md) for current rules and
[DELIVERY-DICE-FLOW.md](DELIVERY-DICE-FLOW.md) for the latest verification.

For another device on the same Wi-Fi, open the network URL printed by the UI
server. A phone must use the computer's LAN address, not `localhost`. Copying
an invite from that address produces a LAN invite. Windows Firewall may need to
allow Node on your private network. No firewall rules are changed by this repo.

Guest credentials live in **sessionStorage**: each independently opened tab can
be a different guest, and refreshing a tab restores its seat. Closing a tab is
not an account recovery mechanism. Preferences and the last name are device-local.
After 90 seconds disconnected, a seat forfeits; its pieces leave play.
In 2v2 a seat forfeiture awards the opposing team a forfeit win.

## Optional accounts

Play offers **Continue as guest**, **Sign in**, and **Create account**. Guests can
create and join rooms immediately. Email/password accounts use Better Auth with
SQLite, framework password hashing, server-backed HttpOnly session cookies,
origin/CSRF checks and authentication rate limits. Passwords and account sessions
are never stored in browser localStorage. Profile displays real name, email,
creation date and verification status; it supports name edits and sign out.

Set `BETTER_AUTH_URL` to the exact browser origin (default `http://localhost:3000`).
For account testing over LAN, use that LAN origin consistently and restart the
backend. Guest LAN play remains independent. `MOVO_AUTH_DB` defaults to
`.data/accounts.sqlite`. Local startup generates and reuses `.data/auth-secret`
unless `BETTER_AUTH_SECRET` is supplied. Keep the database and secret private and
backed up together. A future HTTPS host must set its exact URL and a strong
deployment secret; HTTPS URLs enable Secure cookies. No hosting changes were made.

Account IDs do not replace room participant IDs or tab reconnect credentials.
Creating/signing into an account while at a table keeps the existing table name
and seat. The account name is used for the next room. Guest-stat migration is
deferred because there are no persistent account game statistics.

Google/Discord OAuth and email verification/reset delivery have no configured
credentials or mail transport. They are not presented as working features. New
accounts explicitly show their email as unverified. Public credit: **Discord
@immgroot**. See [DELIVERY-POLISH.md](DELIVERY-POLISH.md) for this pass's verification.

## Build and verify

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
pnpm build
pnpm start
```

`pnpm start` serves the built UI and Socket.IO on **one port**, default 3000.
Stop the dev servers first. `node scripts/smoke.mjs http://localhost:3000`
exercises the HTTP pages and four real Socket.IO clients, plays 40 actions,
reconnects a player, and leaves its disposable room.
Pass `KNOCKOUT_2V2` as the second argument after the URL to smoke-test team mode.
Pass `REVENGE` to verify its four-client production flow and reconnect.

Optional environment variables are listed in `.env.example`. `pnpm start` and
the game child in `pnpm dev` load `.env` if present. Set `MOVO_PUBLIC_ORIGIN`
before building share metadata, and `MOVO_ORIGIN` to the exact browser origin
when running behind a future HTTPS host. Without it, only localhost and private
LAN browser origins are accepted. Native clients may omit Origin but still
require their opaque guest credentials.

## Structure

- `shared/topology.ts`: logical circuit, home lanes, positions and render mapping.
- `shared/game.ts`: pure authoritative Knockout rules, moves and event outcomes.
- `shared/protocol.ts`: typed room, guest, intent and snapshot contract.
- `server/service.ts`: identity, rooms, validation, deduplication, SQLite and timers.
- `server/index.ts`: standalone development authority.
- `server/production.ts`: built UI plus authority on the same HTTP server.
- `server/auth.ts`: Better Auth account database, session configuration and HTTP mount.
- `shared/stack-presentation.ts`: pure visual stacking and legal-piece ordering.
- `hooks/use-game.ts`: reconnecting transport and cancellable presentation queue.
- `components/game/`: landing, room flow, lobby, board, die, tutorial and results.
- `lib/sound.ts`: original synthesized tactile effects and optional haptics.
- `shared/cosmetics.ts`: allowlisted avatar, banner and board-style choices.
- `shared/presentation-events.ts`: capture presentation batches, separate from rules.
- `tests/`: rules, real multiplayer protocol, restart persistence and full matches.
- `qa/polish-server.ts`: **isolated local QA only**, excluded from application builds.

SQLite files are under ignored `.data/`. They contain private guest-session
hashes and room snapshots; do not publish them. This is a single-process server.
Horizontal scaling, public hosting, TLS termination and operational monitoring
remain outside this local pass. Optional accounts are implemented locally.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the precise rules and design decisions,
and [DELIVERY.md](DELIVERY.md) for tested behavior and outstanding QA.

## Repeat the isolated visual QA

After a build, run `node scripts/build-qa.mjs`, then
`node .data/fixture-server.mjs`. Open `http://localhost:3002`, create a four-seat
room as GROOT and start it after KIV, NIDA and NOOR join automatically as real
Socket.IO peers. This uses its own `.data/polish-qa.sqlite` database.

Write `{ "scenario": "unlock", "nonce": "unique-value" }` to
`.data/qa-command.json` to prepare a position, then roll and move through the
browser. Scenarios: opening, one, four, six, corner, safe, knock, stack,
pass-stack, locked, gate-knock, unlock, home-entry, exact, overshoot, victory,
friendly, friendly-gate, finished-teammate and team-victory. The last four need
2v2 where applicable. Fixtures never add a production control endpoint or alter
the normal server's random die. Stop this isolated runner when QA ends.

The latest Revenge fixtures include `revenge-six-chain`, `revenge-empty`,
`revenge-home2`, `revenge-six-six`, and `revenge-stack-selection`. The QA runner
also uses a separate account database and cookie prefix, so its accounts do not
replace the normal local preview's account session.

## Appearance and game feel

Settings and Profile offer **MOVO CLASSIC** and **MOVO PREMIUM**. Premium is
the default. Both render the same topology and authoritative pieces. Eight
curated vector avatars and eight banners are available without uploads.
Guests keep their choices in `movo.preferences`; room members share only the
public avatar/banner IDs. Accounts also save avatar, banner and board style
through the existing Better Auth profile and its automatic additive migration.
No email or account credential is added to room snapshots.

Mute, master/effects volume and reduced motion remain device preferences.
System reduced-motion preferences are also respected. Audio is synthesized
locally after interaction, with no downloads or external audio assets.

For a complete four-player protocol acceptance run, start the isolated QA
server, then `node .data/full-match.mjs`. Join the printed code as a spectator
and write `{ "run": true }` to `.data/full-match-go.json`. The four clients
play a fresh match using real server rolls and legal moves, respecting the
normal request rate limit. Once the winner screen is inspected, write
`{ "rematch": true }` to `.data/full-match-rematch.json` to verify the lobby
reset and stop the clients. Results are in `.data/full-match-progress.json`.
Markers must be written after that run reaches its corresponding waiting step.

See [DELIVERY-PREMIUM.md](DELIVERY-PREMIUM.md) for the 66-point implementation
and QA report, including browser and audio verification limits.

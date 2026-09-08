# MOVO Premium / Board V2 / Profile polish

Implemented locally on September 8, 2026. No commit, push, or deployment.
The working preview is **http://localhost:3000/#play**. Rules, board topology,
room ownership and reconnect architecture remain in the existing engine.

All **291 tests in 14 files pass**. Typecheck, lint, production build and
formatting pass. This workspace is not a Git repository, so `git diff --check`
does not apply.

## Requested 66-point report

1. **Board theme architecture:** one Board component renders either style over the same shared topology. A context supplies the player's preference; explicit theme props support isolated previews and tests.
2. **MOVO Classic preservation:** the original board palette and face remain selectable. Both boards receive the requested shared token, stack and interaction improvements.
3. **MOVO Premium implementation:** Premium is the default for new or older preference records without a theme. It adds an ivory playing surface, stronger colored lanes and crafted details.
4. **Board selector:** Settings and Profile show two labeled visual previews with accessible selected states.
5. **Board preference persistence:** device preferences survive reload; accounts also save their preference through the existing authenticated profile. A signed-in account's preference is restored on sign-in.
6. **Premium material/depth:** warm ivory grain, a darker board edge, raised tile shadows, restrained highlights and a deeper center medallion.
7. **Home area polish:** colored Home lanes and recessed Base wells preserve all existing centers, indices and routes.
8. **Home Gate polish:** Premium gates have stronger frames, open/locked treatments and a small lock graphic. Lock rules and inspect text are unchanged.
9. **Safe spaces:** shield/check markings make Premium safe squares legible without altering the safe-square set. Classic keeps its familiar markings.
10. **Physical pieces:** tokens retain their player color and symbol, with a brighter rim, polished face, lower edge and grounded shadow.
11. **Normal-piece hover:** legal tokens lift slightly and deepen their shadow on hover or keyboard focus.
12. **Turn piece lift:** legal tokens lift four pixels, increasing to five on hover, with one restrained ring pulse. There is no permanent bounce loop.
13. **Movement animation:** existing authoritative paths animate square by square with short hops and a final squash/settle. WAAPI performs frame animation; React does not update every frame.
14. **Halki treatment:** the same physical token gains a reverse rim, arrow and H marker. Stable local numbering and the once-used life indicator remain intact.
15. **Turn-start presentation:** a short local-turn cue, support-turn wording and turn-start sound make the handoff clear. Snapshot version filtering prevents replaying duplicate turn notifications.
16. **Active player card:** the active card receives a player-colored border, darker contrast and a YOUR TURN or PLAYING chip in both game modes.
17. **Board-side cue:** a subtle active-seat edge accent is included on Premium.
18. **Dice animation:** a 640 ms lift, tumble, bounce and settle uses the real rolled value. It changes presentation only. Normal-speed visual QA is limited by this browser's reduced-motion setting.
19. **Multi-dice presentation:** every real Revenge roll remains visible in its existing pool. The browser verified 6 → 6 → 4.
20. **Used/available dice:** used, Halki-spent and otherwise unavailable dice remain visible with status labels and a small scale/contrast change. Available values stay selectable.
21. **Halki dice pairing:** exactly the selected six and matching Home value receive the linked pair treatment. Browser activation spent Dice 2 and 3 in a 6/6/4 pool, leaving Dice 1 available.
22. **Stack layers:** one complete top token sits above thin colored layers. Vertical spread is capped; the entire stack no longer fans across neighboring squares.
23. **Active stack order:** legal pieces take precedence, followed by the active seat. This is a pure render ordering function and does not modify authoritative pieces or occupancy.
24. **Same-player selector:** tapping a stack with multiple legal local tokens opens a compact numbered chooser, using stable piece IDs.
25. **Piece numbering:** local-turn 1–4 labels remain tied to physical pieces. A hidden local token is identified in the chooser; the visible top local token carries its number.
26. **Mobile stack selection:** verified at 390×844. Both numbered choices measured 136×44 pixels, and choosing Piece 1 moved only Piece 1.
27. **Capture animation:** the shared MOVO impact adds a short pulse, rays and victim return hops. The capture segment takes approximately 610 ms after arrival, independent of server resolution.
28. **Multi-capture animation:** victims animate together toward their distinct Base slots with slight staggering, rather than adding one long animation per victim. Captures are deduplicated by physical ID for presentation.
29. **Halki capture:** the impact ring and sound have a distinct reverse treatment. A real legal Halki attack killed both defenders and left the attacker on Track 6 in browser QA.
30. **Halki death:** returning to Base removes the active Halki rim/H marker, while retaining the engine's once-used life history. Verified through normal capture and a HALKI_DIED event.
31. **Sound system:** small original Web Audio effects use oscillator envelopes and a reusable short noise buffer. Playback unlocks after interaction; completed nodes disconnect. No external audio downloads or music loop.
32. **Sound events:** dice roll/land, lift/hop/land, capture/return/multi-capture, gates/Home/finish, turn, shields/reinforcement, Halki activation/movement/kill/death, support, victory, reactions and incoming chat are connected to existing events.
33. **Sound settings:** persisted mute, master and effects volume remain available. Muting or setting either volume to zero creates no sound nodes. UI controls and persistence were tested; audible timbre/balance needs listening on your device.
34. **End-game transition:** the existing finish sequence leads into a stronger winner treatment with a restrained one-shot celebration. Reduced motion suppresses confetti.
35. **Winner screen:** correct winning team or player, real names, curated avatars and chosen banners. The actual full-match Team A screen was inspected on desktop and mobile.
36. **Match summary:** real turn count, total knocks and sixes appear above the existing per-player Home/knocks/sixes/distance table. No invented rewards, ratings or untracked statistics.
37. **Rematch:** Rematch and Return to lobby use the existing host-only rematch intent. Both the full Revenge protocol run and the Knockout host's clicked Rematch button preserved the room and four seats while clearing the match.
38. **Player-card redesign:** curated avatar, banner surface, readable name, actual player-color marker, team and status are retained in one compact card.
39. **Avatar system:** eight curated vector choices: The original, Patang, Dhoop, Chaand, Kamal, Orbit, Darwaza and Lehar. Only allowlisted IDs are public.
40. **Banner system:** eight restrained styles: Classic Dark, Ember, Tide, Grove, Gold, Revenge, Minimal and Signature.
41. **Profile editor:** live avatar/banner card preview, accessible option buttons, board selector and explicit Save appearance feedback. Email/password behavior remains unchanged. Account storage uses supported Better Auth additional profile fields and its existing automatic migration flow. [Better Auth documentation](https://better-auth.com/docs/concepts/database)
42. **Guest cosmetics:** available through Guest profile with no account requirement. Choices persist on-device and are projected to other room members using avatar/banner IDs only.
43. **Preferred board setting:** the same selector is available in Profile and Settings. Account and guest flows use one shared appearance schema.
44. **Responsive cards:** cards remain beside the board on larger screens and above/below it on smaller screens. Small-screen chat now occupies layout space so its closed button does not cover turn controls.
45. **Classic QA:** browser-tested stack selection and all ten viewport sizes. The automated full match was observed with Classic selected before switching to Premium.
46. **Premium QA:** browser-tested dice pairing, activation, captures, Halki death, Knockout capture, account cosmetics and all ten viewport sizes.
47. **Desktop QA:** 1440×900, 1280×720, 1152×720 and 1024×768; no horizontal overflow or player-card/board intersection in either theme.
48. **Tablet QA:** 900×700 and 768×1024; same bounds and card-separation checks passed for both themes.
49. **Mobile QA:** 430×932, 390×844, 360×800 and 844×390 landscape; both themes passed bounds checks. Landscape uses a scrollable board-and-controls layout. The 390×844 guest editor and stack chooser were directly inspected.
50. **Reduced motion:** system preference and the app preference are honored. Persistence was verified; the winner screen correctly omitted confetti. This browser reports system reduced motion, so normal-speed effects were not visually certified.
51. **Performance:** no new runtime dependency, external bitmap set, frame-by-frame React loop or audio downloads. Effects reuse existing SVG pieces; capture batches finish together; audio nodes disconnect. Full multiplayer play remained responsive. No physical-device FPS benchmark was performed.
52. **Game-rule regression:** no edits to the pure rule engines or topology. Presentation selection maps back to existing physical IDs and server-approved moves. Existing rules and full-match simulations continue passing.
53. **Revenge regression:** all existing Revenge/dice/collision/migration/network tests pass. The fresh full multiplayer run completed 1,248 accepted actions over 548 turns, including 33 captures, 16 shield creations, three Halki activations, two Halki deaths and support becoming ready. Team A finished with eight Home.
54. **Knockout regression:** existing solo/team rules and full simulations pass. Browser QA also verified a normal capture, Home unlock, final exact Home move, winner screen and host Rematch.
55. **Auth regression:** account creation, sign-in/out, session persistence, validation and origin checks pass. The browser created a local synthetic account, saved cosmetics, signed out without losing the guest seat, and restored cosmetics after sign-in. Account profile fields also survived a service restart test.
56. **Chat/reactions regression:** a synthetic message rendered in the local test room and an applause reaction was accepted. Existing network coverage remains passing. No real external messages were sent.
57. **Tests added:** nine new tests cover preference migration, public cosmetic projection, board topology parity, compact layer rendering, selector state, capture batching, audio unlock/silence, invalid account cosmetics and live multiplayer cosmetic updates. Existing stack and account persistence tests were updated or extended.
58. **Final passing count:** 291 tests, 14 files. [Machine-readable test results](qa/premium-tests.json)
59. **Typecheck:** passes `pnpm typecheck`.
60. **Lint:** passes `pnpm lint`.
61. **Build:** passes `pnpm build`; QA helpers remain outside the application builds. Vinext prints its existing advisory that automatic route classification is incomplete.
62. **Formatting:** passes `pnpm format:check`. Git diff checking is conditional on a repository; this folder has no `.git` repository.
63. **Browser QA actually performed:** guest profile/save/reload, account signup/save/sign-out/sign-in, settings persistence, stack selection, 6/6/4 pool and exact Halki pair spending, two-victim capture, Halki death, Knockout capture/finish/rematch, chat/reaction, twenty viewport/theme combinations, and the actual complete-match winner screen. The full run used four automated Socket.IO players observed in the browser, not four human browser sessions. An initial over-fast QA run hit the normal rate limit; the successful runner respects it. [Browser QA record](qa/premium-browser.json) · [Complete match record](qa/premium-full-match.json)
64. **Known visual issues:** no card/board overlaps or horizontal overflow found in the tested sizes. Short screens scroll. Normal-speed animation, confetti and audible sound quality still need inspection with reduced motion disabled and speakers available. Physical devices and other browser engines were not tested.
65. **Known functional issues:** none found in the exercised flows. Custom image uploads are intentionally absent because the current project has no safe upload/storage pipeline; curated choices are fully implemented. Existing local single-process hosting constraints remain.
66. **Decisions needed:** no gameplay clarification or migration setup is needed. Inspect the local game feel and audio before any later publication; no publication action was taken.

Creator credit **Discord @immgroot** is preserved.

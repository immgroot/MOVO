# MOVO — Motion, connection voting and sound correction

Implemented locally. The game engines and board topology retain their existing rules. Local preview: http://localhost:3000/#play. Nothing was committed, pushed or deployed.

## Requested 52-point report

1. **Why movement looked like teleporting:** the animation hook OR-ed the saved preference with the operating system setting, so explicit OFF could still take the 45 ms reduced path. Unconditional CSS media rules also shortened effects. The former normal hop schedule was faster, at 100–140 ms.
2. **Normal step duration:** exactly **150 ms per tile**. Six tiles take 900 ms by design; the browser measured about 903 ms of visible travel.
3. **Actual path:** each server-issued `PIECE_MOVED.path` position is animated in order. The same physical SVG token moves between successive board coordinates, with a 6 px lift and a short settle. There is no direct endpoint shortcut.
4. **Normal movement:** browser-tested rolls 1–6 with Reduced Motion explicitly OFF. Observed travel was approximately 149, 296, 451, 601, 750 and 903 ms. Intermediate transform matrices confirmed visible travel through each tile and the corner.
5. **Home movement:** browser-tested outer gate → Home 1 → Home 2, with separate tile steps. Home entry and securing cues remain after movement.
6. **Halki movement:** browser-tested reverse movement outward through enemy Home, Home exit onto the reverse track, return-lane entry and the final Finish step. Existing route ownership/topology rules are unchanged.
7. **Stacks:** browser-tested exact piece 2/3/4 departures from stacks of 2/3/4. The remaining stack is exposed on departure. An airborne token stays independent of its destination stack until arrival. A regression test protects this ordering. Captured tokens hold on the struck square during their stagger delay, then return together.
8. **Reduced Motion control:** explicit OFF / ON buttons in Settings, with explanatory text and pressed states.
9. **OFF:** full 150 ms tile hops, dice tumble, lift/settle and capture effects. The saved OFF value takes precedence over OS motion settings in JavaScript and CSS.
10. **ON:** 45 ms tile transitions, no hop lift, minimal CSS effects and quick dice presentation. A six-tile browser run took about 278 ms.
11. **Persistence:** saved with existing `movo.preferences`. The OS setting seeds only a missing initial preference. ON persisted through an actual browser refresh; OFF also remained active after later refreshes. Explicit OFF against an OS-reduced input has automated coverage.
12. **Disconnect threshold:** server pause begins at 25,000 ms of continuous absence. A real four-client browser test showed the card countdown during grace, then the decision overlay. Automated tests cover exact threshold boundaries, 5-second reconnects and 24-second reconnects.
13. **Pause architecture:** room-level metadata, separate from game mechanics. It records the remaining turn time, missing-player decisions, ballots and resume deadline. It is included in snapshots and SQLite persistence. The server enforces it on both ticks and incoming actions.
14. **WAIT:** preserves the absent participant and freezes play. It does not silently forfeit them. Another removal vote remains available.
15. **Waiting overlay:** named player, avatar, reconnect indicator, elapsed absence and clear actions. It is a nonmodal dialog so existing table chat can remain usable. Background page scrolling is locked during pause.
16. **Resume countdown:** one-second welcome, then 3, 2, 1. Browser-observed the full sequence and disappearance of the pause overlay. The original remaining turn time is restored after the countdown; zero-timer rooms remain untimed.
17. **Removal voting:** only connected, active seated players vote. Spectators, absent players and forfeited players are excluded. Starting a vote is not a YES ballot. Ballots are named, explicit and limited to one per player per round.
18. **Threshold:** strict majority, `floor(eligible / 2) + 1`. Three eligible players need two YES votes. A sole eligible player must explicitly vote YES.
19. **Ties:** tie, sufficient NO ballots, or no majority by the 30-second vote deadline resolves to WAIT. The browser tested both majority-WAIT and a one-to-one tie.
20. **Return during voting:** removes that absent player's decision and invalidates its ballot ID. The browser tested cancellation and the resume countdown. Old or duplicated commands cannot apply a second removal.
21. **Maximum wait:** the old 90-second grace point now opens a new decision checkpoint when connected players remain. Subsequent checkpoints recur every 90 seconds. WAIT never automatically becomes a kick. Completely unattended rooms retain the existing cleanup behavior.
22. **Multiple disconnects:** each absence has a separate ticket and timestamp. One decision is shown at a time, with other missing names queued. A return cannot resume play while another active player is absent. Browser-tested two missing players and their separate decisions.
23. **Paused validation:** roll, move, Halki activation through move, decline-Halki and timeout advancement are blocked. Legal move projection is empty. Tests assert unchanged dice, pieces and turn state after rejected commands.
24. **Chat/reactions:** existing Revenge chat and reactions work during WAIT and voting; actual browser messages and reactions were sent successfully. On short phones, paused chat is pinned within the viewport. Chat was not added to modes that did not already have it.
25. **Player cards:** connected dot, reconnect countdown during grace and WAITING after pause. Active-turn emphasis is suppressed while paused; the turn timer displays its frozen value with PAUSED.
26. **Sounds replaced:** removed oscillator frequency sweeps and the old generic synthetic pitch effects. Sounds now use original generated sample buffers: filtered noise, damped wood/plastic resonances, felt transients and fixed-pitch chimes.
27. **Dice:** six short, varied wood/plastic rattle transients followed by a separate landing tap and bounce.
28. **Movement:** very quiet lift, light wood taps per tile and a stronger final landing. Halki steps use a slightly lower material variant.
29. **Capture:** short physical knock with a plastic transient; grouped captures trigger one impact recipe and a quiet return texture. Audio follows the landing/impact sequence.
30. **Halki:** low, gentle swell and a fixed-pitch chime at activation. Killing and death use physical impacts rather than laser sounds.
31. **Shield:** clack plus a restrained low chime for shield and gate events.
32. **Turn:** a quiet, warm two-note fixed-pitch cue.
33. **Home/Finish:** a soft entry tap/chime and a short two-note secured reward.
34. **Victory:** four short chimes forming a compact sting.
35. **Variation:** four original buffers per material plus slight fixed playback-rate variation. Dice events rotate their material variants. Buffers are cached rather than regenerated for every event.
36. **Mix:** movement is quieter than landing; landing is quieter than capture. UI/chat are restrained. Material peaks are normalized with headroom, then scaled by event gain and both user volume controls.
37. **Audio settings:** mute, master, SFX, autoplay unlock and node cleanup remain intact. Added a Preview dice sound button. Tests cover unlocked scheduling, both gains, muted/zero-volume silence, caching and source/gain disconnection.
38. **Audible QA:** **not performed**. The browser test invoked sound with audio enabled and the generated audio data was checked, but this environment did not provide a way to hear the output. Sound quality is not claimed as audibly verified; please use the preview button for the listening check.
39. **Classic regression:** tested Home entry, captures, stack departures and reduced/full preference behavior on Classic. Board identity and topology tests pass.
40. **Premium regression:** tested rolls 1–6, Halki routes, captures, Finish and the connection UI on Premium. Both themes share the corrected motion implementation.
41. **KNOCKOUT regression:** all game tests pass. Browser-tested individual removal by majority: KIV forfeited while the other players continued. Team Knockout's existing team-forfeit outcome has real-socket test coverage.
42. **REVENGE regression:** all rules and protocol tests pass. Browser-tested Halki paths/captures/Finish, chat, disconnect queue and voting. A successful removal vote produced Team A / FORFEIT against the removed Team B player, using the existing engine result.
43. **Desktop/tablet QA:** desktop 1280×720/800 and tablet 768×1024. Inspected named decisions, votes and action placement. Fixed low-contrast text and inherited footer spacing discovered during review.
44. **Mobile QA:** 390×844 and 360×640. At 360×640 the vote buttons ended around y=488, with no horizontal overflow. Final short-screen chat availability was also rechecked.
45. **Tests added:** 21 real Socket.IO disconnect tests and 14 motion/audio/presentation tests, including a real service close/reopen with persisted pause metadata. Updated two older multiplayer expectations from automatic expiry to explicit voting.
46. **Final count:** **326 passing tests across 16 files**, zero failures. Machine-readable results: `qa/motion-connection-tests.json`.
47. **Typecheck:** passed.
48. **Lint:** passed.
49. **Production build:** passed. The framework emits its existing informational static-route-classification notice.
50. **Formatting:** passed. `git diff --check` is unavailable because this workspace is not a Git repository.
51. **Known issues/limits:** sound needs human listening feedback. The 5/24-second reconnect boundary, timer preservation and persistence checks use a controlled server clock in real-socket tests. Browser QA used one real 25-second wait and controlled clock advances for repeated long-wait cases. Actual OS preference emulation was not available; explicit preference precedence has source and automated coverage.
52. **Decisions needed:** none to use this local build. The existing removal/forfeit behavior supplied the required rules; no new gameplay decision was invented.

Implementation: `server/disconnect.ts`, `server/service.ts`, `shared/protocol.ts`, `hooks/use-game.ts`, `shared/motion.ts`, `shared/stack-presentation.ts`, `components/game/Board.tsx`, `components/game/ConnectionPause.tsx`, `components/game/Movo.tsx`, `lib/audio-design.ts`, `lib/sound.ts`, and the motion/connection styles. Local fixture controls remain isolated in `qa/polish-server.ts` and are excluded from the production app.

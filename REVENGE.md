# MOVO — REVENGE

The September 2026 **dice-flow and turn-UI correction pass** supersedes earlier
dice queues and always-compulsory birth descriptions. The preceding rule
corrections still govern combat, Home, lifetime and support. REVENGE is a four-seat team
mode: seats 0/2 are Team A, seats 1/3 Team B, with four stable physical pieces
per player. KNOCKOUT keeps its own rules and collision engine.

## Normal movement and Home

Six opens a normal piece from Base. Normal pieces move forward, with an exact
roll needed to Finish. Every player starts with Home locked. Their first valid
capture permanently unlocks Home for all four of their pieces.

A normal piece completing the outer route without a knock stops at the exposed
Home Gate in `HOME_GATE_LOCKED`. Unused pips are lost; it cannot enter Home,
pass the gate, or start another lap. It can still share that square and be
captured under normal collision rules. A kill by another piece unlocks the
waiting piece without changing its square. Entering Home needs a later legal
roll. The board and turn dock display the lock and the need for one knock.

## Captures and Team Shield

Evaluate ownership and shield composition before counting defenders. On white
squares, a normal attacker can capture an entire unshielded stack belonging to
one enemy owner. This includes one through four same-owner normal pieces.
Same-owner normal/Halki mixtures do not receive teammate protection either.

| Defenders                                           | Normal attacker     | Halki attacker                          |
| --------------------------------------------------- | ------------------- | --------------------------------------- |
| One enemy piece                                     | Captures it         | Captures it                             |
| Two same-owner pieces, normal or Halki              | Captures both       | Captures both                           |
| Three/four same-owner pieces                        | Captures the stack  | No capture                              |
| Normal pieces from both teammate owners             | Protected/contested | Captures if at most two                 |
| Both teammate owners represented, including a Halki | Protected/contested | Protected, even with only two defenders |

A Team Shield requires **both teammate owners**. Same-owner stacking never
creates a shield or blockade. Teammate normal+normal, normal+Halki, and
Halki+Halki qualify; a shield containing Halki also resists Halki attacks.
A defending Halki is one physical piece. An attacking Halki has a maximum of
two victims, with no partial capture from three or more.

All stacks allow passage. Safe Spaces prevent normal captures; Halki ignores
Safe protection but still respects a teammate shield containing Halki. Home
owners cannot capture invaders inside their own Home. Legal non-capturing
landings can leave a contested square.

When a teammate leaves a contested shield, the remaining composition is
re-evaluated. A waiting normal can capture the now unshielded same-owner stack.
Normal reinforcement against a waiting unshielded enemy remains effective.
A waiting Halki captures a group reduced from three to two only if that remaining
pair is killable; a normal+teammate-Halki shield remains protected. If a protected
pair loses one teammate, a waiting Halki can capture the remaining enemy.
All captures, deaths and shield transitions resolve atomically on the server.

## One Halki life per physical piece

Each new piece starts with `hasUsedHalki = false`. It becomes eligible only when
fully FINISHED, still unused, and its owner has not permanently secured 4/4.
Initial activation requires six followed by the matching reverse Home value and
an actual killable occupant in an opponent's Home:

| Enemy Home square | Required rolls |
| ----------------- | -------------- |
| Home 1            | 6 + 5          |
| Home 2            | 6 + 4          |
| Home 3            | 6 + 3          |
| Home 4            | 6 + 2          |
| Home 5            | 6 + 1          |

Six alone, 6+6, empty squares, three-plus victims, and protected teammate-Halki
targets cannot create Halki. Without a valid target the dice remain available
for other legal play. Valid activation is optional at one or two FINISHED pieces:
choose an eligible piece and target, or choose **Play dice normally**. It is
compulsory only with **exactly three FINISHED pieces and one unfinished piece**,
an unused eligible finished piece, and a fully valid Home target/pair. Without
that complete opportunity, ordinary play continues. At permanent 4/4 no own
activation can occur. The player chooses among all eligible pieces and Homes.
That piece attacks directly inside the enemy Home and stays there as Halki.
It immediately stops counting as finished, records that invaded Home's owner,
and sets `hasUsedHalki = true` permanently for the rest of this match.

Active Halki can make ordinary non-killing reverse moves. Whenever a legal Halki
kill is available, the kill remains compulsory.

## Real turn dice and unlimited sixes

REVENGE has no three-six penalty and no limit on consecutive sixes. Each legally
usable six keeps its movement and grants the next roll. KNOCKOUT retains its own
third-six rule.

Collect the actual roll chain first. Each usable six grants its next roll during
collection. Once collection ends, choose an available die and then a legal
piece. A six can open Base or move a normal/active Halki piece; the bonus is
another real movement value. Using a stored six does not generate a second bonus.

**6 + 4** gives two usable values. **6A + 6B + 4** gives three, all independently
usable in a legal order on the same or different pieces. No mismatch, empty Home
or decline produces replacement rolls. A currently unusable die stays available
while another die might enable it, such as opening Base with six before using
four. When no remaining legal action exists, unused dice are marked **NO MOVE**.

Each die has a server ID and its immediate bonus parent. In 6A,6B,4, only **6B+4**
can form the Home 2 attack. Accepting it marks those exact two dice **HALKI** and
leaves 6A available. Declining an optional choice preserves every piece and both
values; that pair will not be offered again in the same turn. Dice used normally
show **USED**. The completed turn remains visible until the next roll.

The active card and short turn cue identify whose turn it is. Only the local
movement player sees their stable physical piece numbers 1–4 on the board during
their turn, including Base, FINISHED and Halki pieces. Legal pieces have rings.
Move controls and tokens highlight each other on hover/focus. Own shared pieces
fan apart; a compact chooser provides reliable selection. These offsets never
change occupancy or combat. Remote clients and spectators see no local helper
numbers; a support beneficiary sees their own numbers and chooses their pieces.

## Return to the Home you invaded

Each Halki remembers its own original enemy Home. A GROOT piece born in KIV's
Home travels through this sequence, one board square per pip:

**KIV Home outward → KIV Gate → full 52-square reverse outer lap → KIV Gate →
KIV Home 1–5 → Finish.**

Its own GROOT Home does not end that route. Reaching the invaded Gate on initial
exit does not immediately re-enter Home; the full reverse lap is required first.
The final entry and Finish still require legal, exact movement. Two GROOT Halkis
can independently remember KIV and NOOR as different invaded Homes.

On surviving Finish, active Halki becomes a normal FINISHED piece, retaining
`hasUsedHalki = true` and its recorded invaded identity. It cannot activate again.
If captured first, it returns to Base, loses active Halki status, needs six to
reopen, and plays the full normal forward route. Even after finishing that
normal journey it remains ineligible for another Halki life. Other unused
finished pieces remain eligible until permanent 4/4.

## Completion, support and social features

Actual simultaneous 4/4 FINISHED permanently secures that player's pieces.
Their own pieces cannot move or become Halki again. After four complete
rotations of the other active seats, their usual seat becomes a recurring
helper turn. Bonus rolls belong to the same turn. The helper rolls; only the
teammate chooses and moves that teammate's pieces, with the usual dice and
Halki requirements. Actual 8/8 FINISHED wins the team match.

Exact finishing, 90-second disconnect grace and team forfeits remain.
Chat is room-scoped escaped plain text, 1–240
characters, at most three messages per five seconds. Fifty recent messages
remain in memory for the room session. Eight allowlisted reactions last three
seconds, limited to three per four seconds. Spectators can read, but cannot
play, chat or react. Mute, volume and reduced-motion settings remain available.

## Persistence and compatibility

Version 2 Revenge state persists Home unlock, locked gate positions, each piece's
lifetime flag and invaded owner, reverse progress, shields/contests, dice,
permanent completion and support. The additional `diceFlowVersion: 1` stores the
turn pool, consumption, bonus parents, collection phase and declined pairs.
Legacy saves preserve recorded pending dice and spent history without generating
new rolls. Reconnect restores the same physical IDs and pending choices.
Legal actions and targets are recomputed on the server. Chat/reaction history
is not persisted in SQLite.

Old saves cannot prove that a piece with missing lifetime history never used
Halki. Such pieces conservatively become ineligible for a new activation.
Old Home unlock defaults are corrected from recorded capture counts; pieces
already inside Home keep their saved position. Original invaded Homes are
recovered only from saved target identity, enemy lane, or reverse index/distance.
An active route or committed activation that cannot be safely reconstructed
pauses with an explanation asking for a new match, rather than guessing history.
Fresh matches always initialize the corrected state. KNOCKOUT saves bypass this
migration entirely.

## UI and local verification

The 18-part Revenge guide teaches these rules with engine-driven
examples. Board markers identify locked gates, Halki-protected shields, active
Halki and pieces that have used their one life. Eligible choices exclude used
finished pieces. The existing animation queue renders server-provided paths.

Local QA fixtures are isolated under `qa/`, use port 3002 and a separate SQLite
database, and are excluded from production builds. Normal preview at port 3000
uses the real service and cryptographic dice. See
[DELIVERY-DICE-FLOW.md](DELIVERY-DICE-FLOW.md) for this pass's tests
and browser verification.

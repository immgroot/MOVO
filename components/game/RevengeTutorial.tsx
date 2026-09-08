'use client';
import Tutorial from './Tutorial';
import {
  createMatch,
  resolveMove,
  resolveRoll,
  resolveTimeout,
  type Match,
  type GameEvent,
} from '../../shared/game';
import { syncSquares } from '../../shared/revenge-collision';
import type { Position, Seat } from '../../shared/topology';
import { declineHalki } from '../../shared/revenge';
const lesson = (
  title: string,
  copy: string,
  before: string,
  after: string,
  note: string,
) => ({ title, copy, before, after, note });
const lessons = [
  lesson(
    'KNOCK TO UNLOCK HOME',
    'Four players. Opposite teammates. Eight finished pieces win. Normal pieces open on six and move forward. You need a kill before entering Home.',
    'ZERO KILLS · LAP COMPLETE',
    'HOME DOOR · NEED 1 KNOCK',
    'The piece stops at its actual Home Gate. It cannot enter Home, pass the door or begin a second lap.',
  ),
  lesson(
    'ANOTHER PIECE CAN OPEN IT',
    'One GROOT piece is waiting at the Home Door. Another GROOT piece knocks KIV. GROOT’s Home unlocks for all four pieces.',
    'PIECE 1 WAITING · PIECE 2 ATTACKS',
    'HOME UNLOCKED · WAITING PIECE STAYS',
    'The waiting piece enters on a future legal roll. Unlocking never teleports it. The first valid kill unlocks Home for the rest of the match.',
  ),
  lesson(
    'ONE OWNER. NO SHIELD.',
    'KIV + KIV is a same-player stack. A normal enemy landing on an exposed square captures the entire stack, even three or four normals.',
    'KIV + KIV · NO SHIELD',
    'GROOT CAPTURES BOTH',
    'Ownership matters. Same-player stacking gives no shield, wall, blockade or combat protection. Anyone can pass through stacks.',
  ),
  lesson(
    'TWO TEAMMATES. ONE SHIELD.',
    'GROOT normal + NIDA normal creates Team Shield. KIV normal can land without capturing them. If GROOT then leaves, KIV captures the remaining NIDA piece.',
    'GROOT + NIDA + KIV · CONTESTED',
    'SHIELD BREAKS · NIDA → BASE',
    'The contest persists across turns. Both teammate owners must remain represented. Two opposing teammate shields can coexist.',
  ),
  lesson(
    'TEAMMATE HALKI PROTECTS YOU',
    'KIV normal + NOOR Halki is a Team Shield. GROOT normal cannot kill it. NIDA Halki cannot kill it either, even though it contains only two defenders.',
    'NORMAL + TEAMMATE HALKI',
    'PROTECTED FROM NORMAL AND HALKI',
    'GROOT Halki + NIDA normal works too. The special mixed shield is checked before Halki’s two-piece limit.',
  ),
  lesson(
    'SAME OWNER ≠ TEAMMATES',
    'KIV normal + KIV Halki has only one owner, so there is no Team Shield. An enemy Halki can capture this two-piece stack.',
    'KIV NORMAL + KIV HALKI',
    'NO SHIELD · BOTH CAPTURED',
    'A defending Halki counts as one physical piece. A killed Halki returns to Base as normal and keeps its used Halki life.',
  ),
  lesson(
    'REINFORCE THE CONTEST',
    'GROOT + NIDA are sharing a shield with waiting KIV. Another GROOT normal arrives and captures KIV.',
    'GROOT + NIDA + KIV',
    'REINFORCEMENT → KIV TO BASE',
    'YOUR PIECES COME FORWARD ON YOUR TURN. Legal pieces rise above the stack; tap a shared stack to choose between your pieces. The visual offsets never change occupancy.',
  ),
  lesson(
    'ONE HALKI LIFE PER PIECE',
    'A finished piece can return as Halki only once. Base, track and Home 1–5 pieces are ineligible. A finished piece with its Halki life used is also ineligible.',
    'FINISHED UNUSED ✓ · FINISHED USED ✕',
    'ELIGIBILITY BELONGS TO THE PHYSICAL PIECE',
    'Another unused finished piece may still activate. A small used-life marker stays with a former Halki, including after it dies or re-finishes.',
  ),
  lesson(
    'MATCH THE REVERSE HOME VALUE',
    'Initial activation needs an unused finished piece, a six, the matching bonus and an actual killable enemy Home victim.',
    'HOME 1 · 2 · 3 · 4 · 5',
    'BONUS 5 · 4 · 3 · 2 · 1',
    'Home 1 needs 6+5; Home 2 needs 6+4; Home 3 needs 6+3; Home 4 needs 6+2; Home 5 needs 6+1. A protected target is not a valid kill.',
  ),
  lesson(
    'THE HOME KILL IS COMPULSORY',
    'GROOT has exactly 3 finished pieces and 1 unfinished piece. KIV is at Home 2. Six plus its immediate bonus four makes the Home attack compulsory.',
    '3 FINISHED · 1 UNFINISHED · 6 + 4',
    'HALKI REQUIRED · KIV → BASE',
    'The finished piece becomes Halki inside KIV Home and stays there. Its one Halki life is now used forever, and KIV is recorded as its invaded Home.',
  ),
  lesson(
    'NO TARGET. BOTH DICE ARE YOURS.',
    'GROOT rolls six then four. Home 2 is empty: no Halki. The original six and four stay available as two separate legal moves. No replacement roll is generated.',
    'NO HOME VICTIM · ROLL 6 + 4',
    'TURN ROLLS · 6 USED · 4 USED',
    'A six alone never opens Halki. Roll the bonus, then use each die on the same piece or different pieces. The unused finished piece remains finished.',
  ),
  lesson(
    'RETURN TO THE HOME YOU INVADED',
    'GROOT’s Halki leaves KIV Home, makes a full reverse lap, returns to KIV’s entrance, re-enters KIV Home and finishes there.',
    'KIV HOME → REVERSE OUT → FULL LAP',
    'BACK TO KIV HOME → FINISH',
    'Each Halki remembers its own invaded Home. Ownership does not choose its finishing lane. Exact finishing removes active Halki status but never restores its used life.',
  ),
  lesson(
    'HALKI CAN KILL UP TO TWO',
    'Halki can capture one or two enemies when no special shield prevents it. Three or more survive. If three become two, capture happens only when that remaining composition is killable.',
    'HALKI CONTESTS THREE NORMALS',
    'ONE LEAVES · TWO → BASE',
    'No partial capture. Halki overrides normal Safe protection, but cannot defeat a protected teammate shield containing Halki. An available legal Halki kill is compulsory.',
  ),
  lesson(
    'DEATH DOES NOT RESET ITS LIFE',
    'A normal rival kills GROOT’s Halki on white track. It returns to Base as normal, needs six to open and must complete the normal forward journey again.',
    'HALKI DIES → NORMAL BASE',
    'SIX TO REOPEN · HALKI LIFE STILL USED',
    'Even after finishing again, this physical piece can never become Halki a second time. Inside invaded Home, its Home owner cannot kill the invader.',
  ),
  lesson(
    'FOUR FINISHED. FOUR ROTATIONS.',
    'All four finished together permanently locks your pieces. Then wait four complete cycles of the other active seats.',
    '4 / 4 FINISHED · SUPPORT IN 4',
    '4 → 3 → 2 → 1 → READY',
    'Four individual turns are not four rotations. Bonus rolls belong to the same turn. Your four pieces never move or become Halki again.',
  ),
  lesson(
    'YOUR DICE. THEIR MOVE.',
    'After four rotations, your normal seat returns as helper. You roll; your teammate chooses and moves their own piece.',
    'GROOT’S SUPPORT TURN · HELPING NIDA',
    'GROOT ROLLS · NIDA MOVES',
    'The beneficiary’s unused Halki lives and Home unlock apply. Their normal turn still exists. Team victory requires all eight pieces finished.',
  ),
  lesson(
    'HALKI IS USUALLY YOUR CHOICE.',
    'GROOT has 2 finished and 2 unfinished pieces. KIV is at Home 2. Six plus four offers Halki, but GROOT may choose PLAY DICE instead.',
    '2 FINISHED · 2 UNFINISHED · 6 + 4',
    'HALKI DECLINED · BOTH DICE PLAYED',
    'USE HALKI consumes only its exact six and immediate bonus. PLAY DICE keeps both normal values and leaves the finished piece and target untouched.',
  ),
  lesson(
    'EVERY ROLL IS REAL.',
    'Six gives another roll. Six gives another roll. Four ends collection. The turn pool contains 6, 6, 4: three separate dice, with no three-six penalty.',
    'ROLL 6 → ROLL AGAIN → 6 → 4',
    'TURN ROLLS · 6 USED · 6 USED · 4 USED',
    'A Halki candidate uses 6B and its immediate four, never 6A plus four. Earlier dice remain playable. Keep rolling for as many usable sixes as the dice produces.',
  ),
];
const track = (index: number, travelled = 10): Position => ({
  kind: 'TRACK',
  index,
  travelled,
});
function scene(step: number) {
  const s = createMatch(
    'revenge-guide',
    ['GROOT', 'KIV', 'NIDA', 'NOOR'].map((name, seat) => ({
      id: `guide-${seat}`,
      name,
      seat: seat as Seat,
    })),
    0,
    0,
    'REVENGE',
  );
  const ids = s.players.map((p) => p.id),
    stages: { state: Match; events: GameEvent[] }[] = [];
  const open = (seat: number) => {
    s.players[seat].homeUnlocked = true;
    s.players[seat].knocked = 1;
  };
  const special = (piece: number, position: Position) => {
    s.pieces[piece].position = position;
    s.pieces[piece].hasUsedHalki = true;
    if ('homeSeat' in position)
      s.pieces[piece].halkiInvadedHomeOwnerId = ids[position.homeSeat!];
    open(Math.floor(piece / 4));
  };
  const play = (state: Match, seat: number, die: number, piece: number) => {
    const initial = structuredClone(state);
    initial.currentPlayerId = ids[seat];
    initial.revenge!.beneficiaryId = ids[seat];
    initial.dice = null;
    initial.consecutiveSixes = 0;
    Object.assign(initial.revenge!, {
      turnDice: [],
      rollPending: true,
      declinedPairs: [],
      halkiChoice: null,
      awaitingBonus: false,
      activationValue: null,
      queuedRolls: [],
      diceHistory: [],
    });
    let roll = resolveRoll(initial, ids[seat], die, 0);
    if (die === 6 && roll.state.revenge!.rollPending) {
      const bonus = resolveRoll(roll.state, ids[seat], 1, 0);
      roll = { state: bonus.state, events: [...roll.events, ...bonus.events] };
    }
    if (roll.state.dice === null) return roll;
    const moved = resolveMove(
      roll.state,
      ids[seat],
      `${ids[seat]}:${piece}`,
      0,
    );
    return { state: moved.state, events: [...roll.events, ...moved.events] };
  };
  if (step === 0) {
    s.pieces[0].position = track(49, 49);
    stages.push(play(s, 0, 3, 0));
  }
  if (step === 1) {
    s.pieces[0].position = {
      kind: 'HOME_GATE_LOCKED',
      index: 50,
      travelled: 50,
    };
    s.pieces[1].position = track(3);
    s.pieces[4].position = track(6);
    stages.push(play(s, 0, 3, 1));
  }
  if (step === 2) {
    s.pieces[0].position = track(3);
    s.pieces[4].position = track(6);
    s.pieces[5].position = track(6);
    stages.push(play(s, 0, 3, 0));
  }
  if (step === 3) {
    s.pieces[0].position = track(6);
    s.pieces[8].position = track(6);
    s.pieces[4].position = track(3);
    syncSquares(s);
    const arrival = play(s, 1, 3, 0);
    stages.push(arrival, play(arrival.state, 0, 1, 0));
  }
  if (step === 4) {
    s.pieces[4].position = track(6);
    special(12, { kind: 'HALKI_TRACK', homeSeat: 0, index: 6, travelled: 5 });
    s.pieces[0].position = track(3);
    special(8, { kind: 'HALKI_TRACK', homeSeat: 1, index: 9, travelled: 2 });
    syncSquares(s);
    const normal = play(s, 0, 3, 0);
    stages.push(normal, play(normal.state, 2, 3, 0));
  }
  if (step === 5) {
    s.pieces[4].position = track(6);
    special(5, { kind: 'HALKI_TRACK', homeSeat: 0, index: 6, travelled: 5 });
    special(0, { kind: 'HALKI_TRACK', homeSeat: 1, index: 9, travelled: 2 });
    stages.push(play(s, 0, 3, 0));
  }
  if (step === 6) {
    for (const i of [0, 4, 8]) s.pieces[i].position = track(6);
    s.pieces[1].position = track(3);
    syncSquares(s);
    stages.push(play(s, 0, 3, 1));
    s.dice = 3;
    s.revenge!.rollPending = false;
    s.revenge!.turnDice = [
      { id: '1:0', value: 3, bonusOf: null, status: 'available' },
    ];
  }
  if (step === 7) {
    s.pieces[0].position = { kind: 'HOME' };
    s.pieces[1].position = { kind: 'HOME', homeSeat: 1 };
    s.pieces[1].hasUsedHalki = true;
    s.pieces[1].halkiInvadedHomeOwnerId = ids[1];
    open(0);
    s.pieces[2].position = { kind: 'HOME_LANE', index: 3 };
  }
  if ([8, 9, 10].includes(step)) {
    s.pieces[0].position = { kind: 'HOME' };
    s.pieces[1].position = track(4);
    if (step !== 10) s.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
    open(0);
    open(1);
    if (step === 9) {
      s.pieces[1].position = { kind: 'HOME' };
      s.pieces[2].position = { kind: 'HOME' };
      s.pieces[3].position = track(4);
      const six = resolveRoll(s, ids[0], 6, 0),
        bonus = resolveRoll(six.state, ids[0], 4, 0);
      stages.push(six, bonus);
      if (step === 9)
        stages.push(
          resolveMove(bonus.state, ids[0], s.pieces[0].id, 0, ids[1]),
        );
    }
    if (step === 10) {
      const six = resolveRoll(s, ids[0], 6, 0),
        four = resolveRoll(six.state, ids[0], 4, 0);
      const first = resolveMove(
          four.state,
          ids[0],
          s.pieces[1].id,
          0,
          undefined,
          '1:0',
        ),
        second = resolveMove(
          first.state,
          ids[0],
          s.pieces[1].id,
          0,
          undefined,
          '1:1',
        );
      stages.push(six, four, first, second);
    }
  }
  if (step === 11) {
    special(0, { kind: 'HALKI_HOME_INVASION', homeSeat: 1, index: 1 });
    let r = play(s, 0, 2, 0);
    stages.push(r);
    for (let i = 0; i < 13; i++) {
      r = play(r.state, 0, 4, 0);
      stages.push(r);
    }
    stages.push(play(r.state, 0, 6, 0));
  }
  if (step === 12) {
    special(0, { kind: 'HALKI_TRACK', homeSeat: 1, index: 9, travelled: 2 });
    for (const i of [4, 5, 6]) s.pieces[i].position = track(6);
    const arrival = play(s, 0, 3, 0);
    stages.push(arrival, play(arrival.state, 1, 1, 0));
  }
  if (step === 13) {
    special(0, { kind: 'HALKI_TRACK', homeSeat: 1, index: 6, travelled: 5 });
    s.pieces[4].position = track(3);
    const death = play(s, 1, 3, 0);
    stages.push(death, play(death.state, 0, 6, 0));
  }
  if (step === 14 || step === 15) {
    open(0);
    for (let i = 0; i < 3; i++) s.pieces[i].position = { kind: 'HOME' };
    s.pieces[3].position = { kind: 'HOME_LANE', index: 4 };
    const finish = play(s, 0, 1, 3);
    stages.push(finish);
    let next = finish.state;
    next.timerSeconds = 1;
    for (let i = 0; i < 12; i++) {
      next.deadline = 1;
      const r = resolveTimeout(next, 2);
      stages.push(r);
      next = r.state;
    }
    if (step === 15) {
      const roll = resolveRoll(next, ids[0], 6, 3);
      const bonus = resolveRoll(roll.state, ids[0], 1, 3);
      stages.push(
        roll,
        bonus,
        resolveMove(bonus.state, ids[2], `${ids[2]}:0`, 3),
      );
    }
  }
  if (step === 16 || step === 17) {
    s.pieces[2].position = track(4);
    if (step === 16) {
      s.pieces[0].position = { kind: 'HOME' };
      s.pieces[1].position = { kind: 'HOME' };
      s.pieces[4].position = { kind: 'HOME_LANE', index: 1 };
      open(0);
      open(1);
    }
    let next = s;
    for (const value of step === 16 ? [6, 4] : [6, 6, 4]) {
      const r = resolveRoll(next, ids[0], value, 0);
      stages.push(r);
      next = r.state;
    }
    if (step === 16) {
      const r = declineHalki(next, ids[0], 0);
      stages.push(r);
      next = r.state;
    }
    const dice = next.revenge!.turnDice.map((d) => d.id);
    for (const dieId of dice) {
      const r = resolveMove(next, ids[0], s.pieces[2].id, 0, undefined, dieId);
      stages.push(r);
      next = r.state;
    }
  }
  return { initial: s, stages };
}
const guide = {
  lessons,
  scene,
  details: (
    <>
      <p>
        A usable six gives another roll. Keep rolling if you keep getting sixes;
        REVENGE has no automatic third-six penalty. Six alone never opens Halki.
        Collect your rolls, then use every available die separately. The pool
        preserves the exact bonus relationship and marks used values. A matching
        Home birth is optional unless exactly three pieces are finished and one
        is unfinished. Declining keeps both dice; accepting consumes only its
        pair.
      </p>
      <p>
        KNOCK TO UNLOCK HOME. Complete your lap without a knock? Your piece
        stops at your Home Gate. Get a knock with any of your pieces to unlock
        Home and continue on a future roll.
      </p>
      <p>
        Same-player normal stacks can be captured together. Both teammate owners
        create Team Shield; a shield containing Halki resists normal and Halki
        attackers. One Halki can capture at most two enemies where no special
        shield prevents it.
      </p>
      <p>
        ONE HALKI LIFE PER PIECE. Activation needs an unused finished piece,
        six, the exact reverse Home value and a real kill. Halki returns to the
        same enemy Home it invaded after a full reverse lap. Survival or death
        never resets its used life.
      </p>
      <p>
        Refresh restores Home locks, Halki lifetime and target Home, route
        progress, shields and support. The existing 90-second disconnect grace
        and team forfeit apply. Chat retains up to 50 room-session messages;
        spectators can read but cannot send.
      </p>
    </>
  ),
};
export { scene as revengeGuideScene };
export default function RevengeTutorial(props: {
  reduced: boolean;
  onDone: () => void;
}) {
  return <Tutorial {...props} guide={guide} />;
}

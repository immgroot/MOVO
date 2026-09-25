'use client';
import { useEffect, useState, useRef, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  LockKeyhole,
  UnlockKeyhole,
  Shield,
} from 'lucide-react';
import { Board } from './Board';
import {
  createMatch,
  resolveMove,
  resolveRoll,
  legalMoves,
  type Match,
  type GameEvent,
} from '../../shared/game';
import { hopDuration, type PieceMotion } from '../../shared/motion';
import { HOME_GATES, type Position, type Seat } from '../../shared/topology';

const knockoutLessons = [
  {
    title: 'ROLL. KNOCK. GET HOME.',
    copy: 'Each player starts with 4 pieces in Base. Race around the board and get all four Home first. There’s one catch: NO KNOCK. NO HOME.',
    before: '4 PIECES · ONE RACE',
    after: 'ONE KNOCK OPENS YOUR HOME',
    note: 'You can leave this guide and play at any time.',
  },
  {
    title: 'ROLL A 6 TO OPEN',
    copy: 'Roll a 6 to bring one piece from Base onto the track, or move a piece already out by six. A valid six gives you another roll.',
    before: 'BASE 4 · TRACK 0',
    after: 'BASE 3 · TRACK 1 · ROLL AGAIN',
    note: 'Opening places your piece on your start space.',
  },
  {
    title: 'ROLL & MOVE',
    copy: 'Choose a highlighted piece. A roll of 4 takes it through four real board spaces, one small hop at a time.',
    before: 'GROOT ROLLS 4',
    after: '1 → 2 → 3 → 4',
    note: 'Only the pieces that can use your roll are selectable.',
  },
  {
    title: 'KNOCK YOUR RIVALS',
    copy: 'NIDA is 3 spaces ahead. GROOT rolls 3 and lands exactly on her. Her piece returns to Base; GROOT earns a knock.',
    before: 'GROOT: 0 KNOCKS · NIDA: 3 AHEAD',
    after: 'NIDA → BASE · GROOT: 1 KNOCK',
    note: 'Each piece that ignores its own legal capture returns to Base and needs six to reopen, even if another piece captures. In 2v2, different teammates together form a shield; same-owner stacks do not.',
  },
  {
    title: 'NO KNOCK. NO HOME.',
    copy: 'Finish your lap with 0 knocks and your piece stops at the Home Gate. It cannot move. The gate is NOT SAFE: an enemy landing there sends it back to Base.',
    before: '0 KNOCKS → HOME GATE LOCKED',
    after: 'NIDA LANDS → GROOT RETURNS TO BASE',
    note: 'Unused pips are lost on locked-gate arrival. That piece needs a 6 to open again after a knock.',
  },
  {
    title: 'GET 1 KNOCK. OPEN HOME.',
    copy: 'Use another piece to knock a rival. Your first knock unlocks Home for all four of YOUR pieces. The waiting piece stays at the gate until a future valid roll.',
    before: 'PIECE A WAITS · PIECE B CAN KNOCK',
    after: 'HOME UNLOCKED · PIECE A STILL AT GATE',
    note: 'No automatic move. The waiting piece is still knockable until it enters its protected Home Lane.',
  },
  {
    title: 'SAFE SPACES',
    copy: 'The small hexagon-and-dot mark protects pieces on that space. Rivals can share it without a knock. Home Gates use a different threshold mark.',
    before: 'MARKED SPACE = PROTECTED',
    after: 'BOTH PIECES STAY · NO KNOCK',
    note: 'Safe Space: protected. Home Gate: exposed. Home Lane: protected.',
  },
  {
    title: 'EXACT ROLL TO FINISH',
    copy: 'Need 3 spaces to finish? A 5 cannot take that piece Home. A 3 can. Choose another legal piece if you overshoot; with no legal moves, the turn passes.',
    before: 'NEED 3 · ROLL 5 → CANNOT FINISH',
    after: 'ROLL 3 → HOME ✓',
    note: 'Knocks and Home finishes do not give bonus rolls.',
  },
  {
    title: 'WATCH YOUR SIXES',
    copy: '6: roll again. 6: roll again. A third consecutive 6 ends your turn and forfeits only that third movement. Your earlier moves stay.',
    before: '6 → AGAIN · 6 → AGAIN',
    after: 'THIRD 6 → NO MOVE · TURN ENDS',
    note: 'A six only earns another roll when you make a valid move.',
  },
  {
    title: 'GET ALL FOUR HOME',
    copy: 'First player with 4 / 4 Home wins KNOCKOUT. In 2v2, opposite seats are teammates and you need all 8 combined pieces Home.',
    before: '3 / 4 HOME · ONE TO GO',
    after: '4 / 4 HOME · WINNER',
    note: '2v2: friendly pieces cannot knock. Each teammate needs their own knock. Finished players’ turns are skipped; their rolls are not transferred.',
  },
];
const track = (index: number, travelled = 10): Position => ({
  kind: 'TRACK',
  index,
  travelled,
});
function knockoutScene(step: number) {
  const s = createMatch(
    'tutorial',
    ['GROOT', 'KIV', 'NIDA', 'NOOR'].map((name, i) => ({
      id: name,
      name,
      seat: i as Seat,
    })),
    0,
  );
  const stages: { state: Match; events: GameEvent[] }[] = [];
  const move = (source: Match, id: string, roll: number, piece: number) => {
    const setup = structuredClone(source);
    setup.currentPlayerId = id;
    setup.dice = null;
    const r = resolveRoll(setup, id, roll);
    const result =
      r.state.dice === null ? r : resolveMove(r.state, id, `${id}:${piece}`);
    return {
      state: result.state,
      events: [...r.events, ...(result === r ? [] : result.events)],
    };
  };
  if (step === 1) stages.push(move(s, 'GROOT', 6, 0));
  if (step === 2) {
    s.pieces[0].position = track(2);
    stages.push(move(s, 'GROOT', 4, 0));
  }
  if (step === 3) {
    s.pieces[0].position = track(3);
    s.pieces[8].position = track(6);
    stages.push(move(s, 'GROOT', 3, 0));
  }
  if (step === 4) {
    s.pieces[0].position = track(47, 47);
    s.pieces[8].position = track(47);
    const arrival = move(s, 'GROOT', 4, 0);
    stages.push(arrival, move(arrival.state, 'NIDA', 3, 0));
  }
  if (step === 5) {
    s.pieces[0].position = {
      kind: 'HOME_GATE_LOCKED',
      index: HOME_GATES[0],
      travelled: 50,
    };
    s.pieces[1].position = track(3);
    s.pieces[4].position = track(6);
    stages.push(move(s, 'GROOT', 3, 1));
  }
  if (step === 6) {
    s.pieces[0].position = track(6);
    s.pieces[8].position = track(8);
    stages.push(move(s, 'GROOT', 2, 0));
  }
  if (step === 7) {
    s.players[0].homeUnlocked = true;
    s.players[0].knocked = 1;
    s.pieces[0].position = { kind: 'HOME_LANE', index: 2 };
    stages.push(move(s, 'GROOT', 5, 0), move(s, 'GROOT', 3, 0));
  }
  if (step === 8) {
    const first = move(s, 'GROOT', 6, 0),
      second = move(first.state, 'GROOT', 6, 0);
    stages.push(first, second, move(second.state, 'GROOT', 6, 0));
  }
  if (step === 9) {
    s.players[0].homeUnlocked = true;
    s.players[0].knocked = 1;
    for (let i = 0; i < 3; i++) s.pieces[i].position = { kind: 'HOME' };
    s.pieces[3].position = { kind: 'HOME_LANE', index: 4 };
    stages.push(move(s, 'GROOT', 1, 3));
  }
  return { initial: s, stages };
}
export default function Tutorial({
  reduced,
  onDone,
  guide,
}: {
  reduced: boolean;
  onDone: () => void;
  guide?: {
    lessons: typeof knockoutLessons;
    scene: typeof knockoutScene;
    details: ReactNode;
  };
}) {
  const lessons = guide?.lessons ?? knockoutLessons,
    scene = guide?.scene ?? knockoutScene;
  const [step, setStep] = useState(0),
    [replay, setReplay] = useState(0),
    [model, setModel] = useState(() => scene(0).initial),
    [positions, setPositions] = useState<Record<string, Position>>({}),
    [motion, setMotion] = useState<PieceMotion | null>(null),
    [effect, setEffect] = useState(''),
    [effectSeat, setEffectSeat] = useState<number>(),
    [caption, setCaption] = useState(''),
    [done, setDone] = useState(false);
  const touch = useRef(0);
  useEffect(() => {
    let cancelled = false,
      sequence = 0;
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const demo = scene(step),
      simple = reduced;
    async function play() {
      setModel(demo.initial);
      setPositions({});
      setMotion(null);
      setEffect('');
      setDone(false);
      setCaption(lessons[step].before);
      await wait(450);
      for (const stage of demo.stages) {
        for (const e of stage.events) {
          if (cancelled) return;
          setEffectSeat(
            stage.state.players.find((p) => p.id === e.playerId)?.seat,
          );
          const actor =
            stage.state.players.find((p) => p.id === e.playerId)?.name ??
            'Player';
          if (e.type === 'HALKI_ACTIVATED') {
            setCaption(`${actor} · HALKI ACTIVATES INTO ENEMY HOME`);
            setEffect('halki-activation');
            await wait(simple ? 45 : 450);
          }
          if (
            [
              'SHIELD_BROKEN',
              'REINFORCED',
              'CONTEST_CREATED',
              'SUPPORT_READY',
            ].includes(e.type)
          ) {
            setEffect(e.type.toLowerCase().replaceAll('_', '-'));
            setCaption(e.type.replaceAll('_', ' '));
            await wait(simple ? 45 : 350);
          }
          if (e.type === 'DICE_ROLLED') {
            setCaption(`${actor} ROLLS ${e.value}`);
            await wait(450);
          }
          if (e.type === 'PIECE_MOVED' && e.pieceId && e.path) {
            let from = e.from!;
            for (const [i, to] of e.path.entries()) {
              if (cancelled) return;
              const duration = simple ? 45 : hopDuration(i, e.path.length);
              setMotion({
                key: ++sequence,
                pieceId: e.pieceId,
                from,
                duration,
                kind: 'hop',
                final: i === e.path.length - 1,
                reduced: simple,
              });
              setPositions((p) => ({ ...p, [e.pieceId!]: to }));
              await wait(duration);
              from = to;
            }
          }
          if (e.type === 'PIECE_KNOCKED' && e.pieceId) {
            setCaption(
              `${actor} KNOCKS ${stage.state.players.find((p) => p.id === e.targetId)?.name ?? 'RIVAL'} → BASE`,
            );
            setEffect('knock-impact');
            await wait(simple ? 0 : 130);
            if (cancelled) return;
            setMotion({
              key: ++sequence,
              pieceId: e.pieceId,
              from: e.from!,
              duration: simple ? 45 : 460,
              kind: 'return',
              final: true,
              reduced: simple,
            });
            setPositions((p) => ({ ...p, [e.pieceId!]: { kind: 'BASE' } }));
            await wait(simple ? 45 : 460);
          }
          if (e.type === 'HOME_LOCKED') {
            setEffect('home-gate-lock');
            setCaption('HOME LOCKED · GET 1 KNOCK · GATE IS NOT SAFE');
            await wait(950);
          }
          if (e.type === 'HOME_UNLOCKED') {
            setEffect('home-unlock');
            setCaption(`${e.playerId}: 1 KNOCK · HOME UNLOCKED`);
            setModel((prev) => ({ ...prev, players: stage.state.players }));
            await wait(500);
          }
          if (e.type === 'SIX_BURNED') {
            setCaption('THIRD SIX · MOVEMENT FORFEITED');
            await wait(500);
          }
        }
        if (cancelled) return;
        setModel(stage.state);
        setPositions({});
        setMotion(null);
        await wait(550);
      }
      if (!cancelled) {
        setDone(true);
        setCaption(lessons[step].after);
      }
    }
    void play();
    return () => {
      cancelled = true;
    };
  }, [step, replay, reduced, scene, lessons]);
  const lesson = lessons[step];
  return (
    <div
      className={`tutorial guided-tutorial ${reduced ? 'reduce-motion' : ''}`}
      onTouchStart={(e) => {
        touch.current = e.changedTouches[0].clientX;
      }}
      onTouchEnd={(e) => {
        const delta = e.changedTouches[0].clientX - touch.current;
        if (Math.abs(delta) > 70)
          setStep((n) =>
            Math.max(0, Math.min(lessons.length - 1, n + (delta < 0 ? 1 : -1))),
          );
      }}
    >
      <div className="lesson-demo">
        <Board
          pieces={model.pieces}
          active={
            model.revenge
              ? model.players.find((p) => p.id === model.currentPlayerId)?.seat
              : undefined
          }
          legal={
            model.revenge
              ? legalMoves(model, model.revenge.beneficiaryId).map(
                  (m) => m.pieceId,
                )
              : []
          }
          revenge={model.revenge}
          numbered={
            model.revenge
              ? model.pieces
                  .filter((p) => p.ownerId === model.revenge!.beneficiaryId)
                  .map((p) => p.id)
              : []
          }
          eligible={
            model.revenge
              ? model.pieces
                  .filter(
                    (p) =>
                      p.position.kind === 'HOME' &&
                      p.hasUsedHalki === false &&
                      !model.revenge!.secured.includes(p.ownerId),
                  )
                  .map((p) => p.id)
              : []
          }
          positions={positions}
          motion={motion}
          unlocked={model.players
            .filter((p) => p.homeUnlocked)
            .map((p) => p.seat)}
          effect={effect}
          effectSeat={effectSeat}
          label={`Example: ${lesson.title}`}
        />
        {model.revenge && (
          <div className="guide-roll-pool">
            <strong>
              {model.revenge.halkiChoice
                ? model.revenge.halkiChoice.required
                  ? 'HALKI REQUIRED'
                  : 'HALKI AVAILABLE · USE HALKI OR PLAY DICE'
                : 'TURN ROLLS'}
            </strong>
            <div>
              {(model.revenge.turnDice.length
                ? model.revenge.turnDice
                : (model.revenge.previousTurn?.dice ?? [])
              ).map((d) => (
                <span key={d.id}>
                  {d.value}
                  <small>
                    {d.status === 'available'
                      ? 'AVAILABLE'
                      : d.status === 'halki'
                        ? 'HALKI'
                        : 'USED'}
                  </small>
                </span>
              ))}
            </div>
          </div>
        )}
        <output className="lesson-caption" aria-live="polite">
          {caption}
        </output>
      </div>
      <div className="lesson-copy">
        <span className="eyebrow">
          {String(step + 1).padStart(2, '0')} / {lessons.length} ·{' '}
          {done ? 'YOUR MOVE NEXT' : 'WATCH THE EXAMPLE'}
        </span>
        <h3>{lesson.title}</h3>
        <p>{lesson.copy}</p>
        <div className="lesson-note">
          {!guide && step === 4 ? (
            <LockKeyhole size={18} />
          ) : !guide && step === 5 ? (
            <UnlockKeyhole size={18} />
          ) : (
            <Shield size={18} />
          )}
          <span>{lesson.note}</span>
        </div>
        <button className="text-button" onClick={() => setReplay((n) => n + 1)}>
          <RotateCcw size={15} /> Replay example
        </button>
      </div>
      <div className="tutorial-nav">
        <button
          className="quiet-button"
          disabled={step === 0}
          onClick={() => setStep(step - 1)}
        >
          <ArrowLeft size={16} /> Back
        </button>
        <span className="lesson-count">
          {step + 1} / {lessons.length}
        </span>
        <button
          className="primary-button"
          onClick={() =>
            step === lessons.length - 1 ? onDone() : setStep(step + 1)
          }
        >
          {step === lessons.length - 1 ? 'Let’s play' : 'Next'}
          <ArrowRight size={16} />
        </button>
      </div>
      <details className="rules-details">
        <summary>At the table: turns, stacks & reconnect</summary>
        {guide ? (
          guide.details
        ) : (
          <>
            <p>
              Pieces may share a space. Anyone can pass through a stack. On an
              exposed space, every enemy piece there returns to Base when you
              land; teammates stay in 2v2.
            </p>
            <p>
              A locked gate piece cannot use a roll. Other pieces can. Your Home
              unlock stays for the entire match, even if your pieces are
              knocked.
            </p>
            <p>
              A timer expiry passes the turn. Refresh restores your room, teams,
              pending roll and gate locks. A disconnect reserves your seat for
              90 seconds. Leaving or exceeding that time forfeits your seat; in
              2v2 your team forfeits.
            </p>
          </>
        )}
      </details>
    </div>
  );
}

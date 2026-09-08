'use client';
import { useEffect, useRef, useState } from 'react';
import { Check, Clock3, Wifi, WifiOff, Users } from 'lucide-react';
import type { Intent, Member, Snapshot } from '../../shared/protocol';
import { Avatar } from './Cosmetics';
import { publicCosmetics } from '../../shared/cosmetics';

export function ConnectionLabel({
  member,
  model,
}: {
  member: Member;
  model: Snapshot;
}) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Date.now() - started), 500);
    return () => clearInterval(timer);
  }, [model.serverNow]);
  const seconds = Math.max(
    0,
    Math.ceil(
      (25000 -
        (model.serverNow +
          elapsed -
          (member.disconnectedAt ?? model.serverNow))) /
        1000,
    ),
  );
  return (
    <span className="connection-label">
      <WifiOff size={10} />
      {model.pause?.decisions.some((d) => d.playerId === member.id)
        ? 'WAITING'
        : `RECONNECTING · ${seconds}s`}
    </span>
  );
}

export default function ConnectionPause({
  model,
  now,
  pending,
  onAction,
  onLeave,
}: {
  model: Snapshot;
  now: number;
  pending: boolean;
  onAction: (i: Omit<Intent, 'v' | 'requestId'>) => Promise<unknown>;
  onLeave: () => void;
}) {
  const pause = model.pause!,
    decision = pause.decisions[0];
  const missing = model.members.filter(
    (m) =>
      !m.connected &&
      m.seat !== null &&
      model.match?.players.some((p) => p.id === m.id && !p.forfeited),
  );
  const target =
    model.members.find((m) => m.id === decision?.playerId) ?? missing[0];
  const voters = model.members.filter(
    (m) =>
      m.connected &&
      m.seat !== null &&
      model.match?.players.some((p) => p.id === m.id && !p.forfeited),
  );
  const eligible = voters.some((m) => m.id === model.selfId);
  const returned = pause.returnedIds
    .map((id) => model.members.find((m) => m.id === id)?.name)
    .filter(Boolean)
    .join(' + ');
  const countdown = pause.resumeAt
    ? Math.max(1, Math.ceil((pause.resumeAt - now) / 1000))
    : null;
  const voting = decision?.phase === 'voting',
    waiting = decision?.phase === 'waiting';
  const seconds = Math.max(
    0,
    Math.floor((now - (target?.disconnectedAt ?? now)) / 1000),
  );
  const heading = countdown
    ? countdown > 3 && returned
      ? `${returned} ${pause.returnedIds.length > 1 ? 'ARE' : 'IS'} BACK`
      : 'Back to the table.'
    : voting
      ? `Remove ${target?.name}?`
      : waiting
        ? `Waiting for ${target?.name}.`
        : `${target?.name ?? 'A player'} disconnected.`;
  const panel = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, [decision?.id, pause.resumeAt]);
  const act = (
    type: 'disconnectWait' | 'disconnectVoteStart' | 'disconnectVote',
    vote?: 'remove' | 'wait',
  ) =>
    onAction({
      type,
      decisionId: decision?.id,
      targetId: decision?.playerId,
      vote,
    });
  const yes = voters.filter((m) => decision?.votes[m.id] === 'remove').length;
  return (
    <div className="connection-overlay">
      <dialog
        open
        ref={panel}
        tabIndex={-1}
        aria-modal="false"
        aria-labelledby="connection-heading"
        className="connection-panel"
        data-connection-phase={
          countdown ? 'resuming' : (decision?.phase ?? 'reconnecting')
        }
      >
        <span className="eyebrow">
          {countdown ? 'EVERYONE’S HERE' : 'TABLE PAUSED'}
        </span>
        <div
          className={`connection-portrait ${countdown ? 'returned' : ''}`}
          aria-hidden="true"
        >
          {countdown ? (
            <Wifi size={35} />
          ) : (
            <>
              <Avatar id={publicCosmetics(target?.cosmetics).avatar} />
              <span>
                <WifiOff size={16} />
              </span>
            </>
          )}
        </div>
        <h2 id="connection-heading">{heading}</h2>
        <div className="connection-body">
          {countdown ? (
            <>
              <output className="resume-number" aria-live="polite">
                {countdown > 3 ? <Check size={36} /> : countdown}
              </output>
              <p>Your turn picks up where it paused.</p>
            </>
          ) : (
            <>
              <p>
                {voting
                  ? 'Every connected player has one vote. A strict majority is required to remove.'
                  : waiting
                    ? 'Take your time. The board and turn timer are safely paused.'
                    : 'Give them a moment to return, or let the table decide whether to continue without them.'}
              </p>
              <div className="connection-meta">
                <span>
                  <Clock3 size={14} /> {Math.floor(seconds / 60)}:
                  {String(seconds % 60).padStart(2, '0')} away
                </span>
                <span>
                  <WifiOff size={14} /> Reconnecting
                </span>
              </div>
              {voting && (
                <>
                  <div className="vote-progress">
                    <b>
                      {yes} / {Math.floor(voters.length / 2) + 1} needed
                    </b>
                    <span>
                      {Math.max(
                        0,
                        Math.ceil(
                          ((decision.voteClosesAt ?? now) - now) / 1000,
                        ),
                      )}
                      s left
                    </span>
                  </div>
                  <ul className="connection-ballots">
                    {voters.map((m) => (
                      <li key={m.id}>
                        <span>
                          {m.name}
                          {m.id === model.selfId ? ' · YOU' : ''}
                        </span>
                        <b className={decision.votes[m.id] ?? ''}>
                          {decision.votes[m.id] === 'remove'
                            ? 'Remove'
                            : decision.votes[m.id] === 'wait'
                              ? 'Wait'
                              : 'Deciding…'}
                        </b>
                      </li>
                    ))}
                  </ul>
                  <small>A tie or no majority means we keep waiting.</small>
                </>
              )}
              {decision?.outcome === 'wait' && !voting && (
                <p className="vote-outcome">
                  The table is waiting. You can start another vote.
                </p>
              )}
              {missing.length > 1 && (
                <div className="connection-queue">
                  <Users size={14} />
                  <span>
                    Also reconnecting:{' '}
                    {missing
                      .filter((m) => m.id !== target?.id)
                      .map((m) => m.name)
                      .join(', ')}
                    . We’ll handle each player in order.
                  </span>
                </div>
              )}
              {model.settings.mode !== 'KNOCKOUT' && (
                <small>
                  Removing a player forfeits their team. The opposing team wins.
                </small>
              )}
            </>
          )}
        </div>
        {!countdown && (
          <div className="connection-actions">
            {decision && eligible ? (
              voting ? (
                <>
                  <button
                    className="primary-button"
                    disabled={pending || !!decision.votes[model.selfId]}
                    onClick={() => act('disconnectVote', 'wait')}
                  >
                    Vote to wait
                  </button>
                  <button
                    className="quiet-button remove-vote"
                    disabled={pending || !!decision.votes[model.selfId]}
                    onClick={() => act('disconnectVote', 'remove')}
                  >
                    Vote to remove
                  </button>
                  {decision.votes[model.selfId] && (
                    <small>Your vote is recorded.</small>
                  )}
                </>
              ) : (
                <>
                  <button
                    className="primary-button"
                    disabled={pending || waiting}
                    onClick={() => act('disconnectWait')}
                  >
                    {waiting ? 'Waiting together' : 'Wait for player'}
                  </button>
                  <button
                    className="quiet-button"
                    disabled={pending}
                    onClick={() => act('disconnectVoteStart')}
                  >
                    Start removal vote
                  </button>
                </>
              )
            ) : (
              <p>
                {eligible
                  ? 'Giving them a moment to reconnect…'
                  : 'Connected seated players are deciding.'}
              </p>
            )}
          </div>
        )}
        <footer>
          <span>
            {model.settings.mode === 'REVENGE'
              ? 'Table chat stays open.'
              : 'Your board is saved.'}
          </span>
          <button className="text-button" onClick={onLeave}>
            Leave table
          </button>
        </footer>
      </dialog>
    </div>
  );
}

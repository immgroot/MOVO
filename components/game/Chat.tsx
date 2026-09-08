'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { REACTIONS, type Reaction } from '../../shared/chat';
import { COLORS } from '../../shared/topology';
import { teamForSeat } from '../../shared/game';
import type { Intent, Reply, Snapshot } from '../../shared/protocol';

export function SeatReaction({
  reaction,
  serverNow,
}: {
  reaction?: Reaction;
  serverNow: number;
}) {
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!reaction) return;
    const t = setTimeout(
      () => setHidden(reaction.id),
      Math.max(0, 3000 - (serverNow - reaction.at)),
    );
    return () => clearTimeout(t);
  }, [reaction, serverNow]);
  return reaction &&
    hidden !== reaction.id &&
    serverNow - reaction.at < 3000 ? (
    <span
      key={reaction.id}
      className="seat-reaction"
      aria-label={`Reaction ${reaction.emoji}`}
    >
      {reaction.emoji}
    </span>
  ) : null;
}
export default function Chat({
  model,
  onAction,
  pending,
}: {
  model: Snapshot;
  onAction: (i: Omit<Intent, 'v' | 'requestId'>) => Promise<Reply>;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const canSend = model.members.some(
    (m) => m.id === model.selfId && m.seat !== null && m.connected,
  );
  useEffect(() => {
    if (open && list.current)
      list.current.scrollTop = list.current.scrollHeight;
  }, [model.chat, open]);
  return (
    <div className={`room-chat ${open ? 'chat-open' : ''}`}>
      <button
        className="chat-toggle quiet-button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="revenge-chat"
      >
        <MessageCircle size={17} /> Table chat{' '}
        <span>{model.chat?.length ?? 0}</span>
      </button>
      {open && (
        <section
          id="revenge-chat"
          aria-label="Table chat"
          className="chat-panel"
        >
          <header>
            <b>AT THE TABLE</b>
            <small>ROOM {model.code}</small>
            <button
              className="icon-button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
            >
              <X size={16} />
            </button>
          </header>
          <div
            className="chat-messages"
            role="log"
            aria-live="polite"
            ref={list}
          >
            {!model.chat?.length && (
              <p className="chat-empty">A little friendly rivalry?</p>
            )}
            {model.chat?.map((m) => (
              <p key={m.id}>
                <strong style={{ color: COLORS[m.seat] }}>
                  {m.name}
                  <small>TEAM {teamForSeat(m.seat)}</small>
                </strong>
                <span>{m.text}</span>
              </p>
            ))}
          </div>
          {canSend ? (
            <>
              <div className="quick-reactions" aria-label="Quick reactions">
                {REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    aria-label={`React ${emoji}`}
                    disabled={pending}
                    onClick={() => void onAction({ type: 'reaction', emoji })}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!draft.trim()) return;
                  const r = await onAction({ type: 'chat', text: draft });
                  if (r.ok) setDraft('');
                }}
              >
                <input
                  aria-label="Chat message"
                  maxLength={240}
                  placeholder="Your move. Your words."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={pending}
                />
                <button
                  aria-label="Send message"
                  disabled={pending || !draft.trim()}
                >
                  <Send size={17} />
                </button>
              </form>
              <small className="chat-limit">
                {draft.length}/240 · This room only
              </small>
            </>
          ) : (
            <p className="chat-empty">Spectators can read the table.</p>
          )}
        </section>
      )}
    </div>
  );
}

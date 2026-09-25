'use client';
import { createContext, useContext, useState } from 'react';
import {
  AVATARS,
  BANNERS,
  publicCosmetics,
  type BoardStyle,
  type Cosmetics,
} from '../../shared/cosmetics';
export const BoardStyleContext = createContext<BoardStyle>('classic');
export const useBoardStyle = () => useContext(BoardStyleContext);
export function Avatar({
  id = 'movo',
  className = '',
}: {
  id?: string;
  className?: string;
}) {
  const avatar = AVATARS.find((a) => a.id === id) ?? AVATARS[0];
  return (
    <svg
      className={`movo-avatar ${className}`}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        d={avatar.path}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function BoardSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: BoardStyle;
  onChange: (v: BoardStyle) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="board-selector">
      <legend>BOARD STYLE</legend>
      <div>
        {(['classic', 'premium', 'colorful'] as const).map((style) => (
          <button
            type="button"
            key={style}
            disabled={disabled}
            aria-pressed={value === style}
            aria-label={`MOVO ${style === 'classic' ? 'Classic' : style === 'colorful' ? 'Colorful' : 'Premium'}`}
            onClick={() => onChange(style)}
          >
            <svg
              viewBox="0 0 160 100"
              className={`board-swatch ${style}`}
              aria-hidden="true"
            >
              <rect
                x="3"
                y="3"
                width="154"
                height="94"
                rx="12"
                fill={style === 'classic' ? '#d5c5a8' : '#f1ead8'}
              />
              <path
                d="M67 8H93V92H67Z M8 37H152V63H8Z"
                fill={style === 'classic' ? '#e9ddc4' : '#d8cfb9'}
              />
              {[
                ['#c8624c', 10, 68],
                ['#318769', 10, 10],
                ['#c29b42', 105, 10],
                ['#487b9b', 105, 68],
              ].map(([c, x, y]) => (
                <rect
                  key={c}
                  x={x}
                  y={y}
                  width="45"
                  height="22"
                  rx="6"
                  fill={c as string}
                  opacity={
                    style === 'colorful'
                      ? '1'
                      : style === 'classic'
                        ? '.35'
                        : '.75'
                  }
                />
              ))}
              <path
                d="M80 37 93 50 80 63 67 50Z"
                fill={style === 'classic' ? '#bda982' : '#304236'}
              />
              <text
                x="80"
                y="53"
                textAnchor="middle"
                fontSize="7"
                fill={style === 'classic' ? '#5b513d' : '#eee6cb'}
              >
                M
              </text>
            </svg>
            <span>MOVO {style.toUpperCase()}</span>
            <small>
              {style === 'classic'
                ? 'The familiar original'
                : style === 'colorful'
                  ? 'Four colors. Your table.'
                  : 'Crafted for rivalry'}
            </small>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
export function CosmeticEditor({
  value,
  theme,
  name,
  onSave,
}: {
  value: Cosmetics;
  theme: BoardStyle;
  name: string;
  onSave: (v: Cosmetics & { boardTheme: BoardStyle }) => Promise<string | void>;
}) {
  const [draft, setDraft] = useState({
      ...publicCosmetics(value),
      boardTheme: theme,
    }),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <section className="cosmetic-editor" aria-label="Player appearance">
      <div className={`profile-card-preview banner-${draft.banner}`}>
        <Avatar id={draft.avatar} />
        <div>
          <small>YOUR TABLE IDENTITY</small>
          <strong>{name || 'Your name'}</strong>
          <span>Made for a little rivalry.</span>
        </div>
      </div>
      <fieldset>
        <legend>CHOOSE YOUR AVATAR</legend>
        <div className="avatar-options">
          {AVATARS.map((a) => (
            <button
              type="button"
              key={a.id}
              aria-label={`Avatar: ${a.name}`}
              aria-pressed={draft.avatar === a.id}
              onClick={() => {
                setDraft({ ...draft, avatar: a.id });
                setMessage('');
              }}
            >
              <Avatar id={a.id} />
              <small>{a.name}</small>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>YOUR BANNER</legend>
        <div className="banner-options">
          {BANNERS.map((b) => (
            <button
              type="button"
              key={b.id}
              className={`banner-${b.id}`}
              aria-pressed={draft.banner === b.id}
              onClick={() => {
                setDraft({ ...draft, banner: b.id });
                setMessage('');
              }}
            >
              {b.name}
            </button>
          ))}
        </div>
      </fieldset>
      <BoardSelector
        value={draft.boardTheme}
        onChange={(boardTheme) => setDraft({ ...draft, boardTheme })}
      />
      <button
        type="button"
        className="primary-button full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            const error = await onSave(draft);
            setMessage(error || 'Your look is saved.');
          } catch {
            setMessage('Could not save. Please try again.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Saving…' : 'Save appearance'}
      </button>
      {message && <output className="cosmetic-save-status">{message}</output>}
    </section>
  );
}

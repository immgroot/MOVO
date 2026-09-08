'use client';
import {
  memo,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { stackPresentation } from '../../shared/stack-presentation';
import type { PieceMotion } from '../../shared/motion';
import type { RevengeState } from '../../shared/revenge-types';
import { useBoardStyle } from './Cosmetics';
import type { BoardStyle } from '../../shared/cosmetics';
import {
  TRACK,
  LANE_LENGTH,
  COLORS,
  MARKS,
  baseCell,
  laneCell,
  coordinates,
  positionKey,
  HOME_GATES,
  type Position,
  type Seat,
} from '../../shared/topology';
export interface BoardPiece {
  id: string;
  seat: Seat;
  number: number;
  position: Position;
  hasUsedHalki?: boolean;
}
export const demoPieces: BoardPiece[] = Array.from({ length: 16 }, (_, i) => {
  const seat = Math.floor(i / 4) as Seat,
    number = i % 4;
  const spots = [
    [3, 16],
    [17, 25],
    [28, 42],
    [44, 48],
  ];
  return {
    id: `demo-${i}`,
    seat,
    number,
    position:
      number < 2
        ? { kind: 'TRACK', index: spots[seat][number], travelled: 10 }
        : { kind: 'BASE' },
  };
});
export const Board = memo(function Board({
  pieces = demoPieces,
  legal = [],
  onMove,
  unlocked = [],
  active,
  effect,
  label = 'MOVO Knockout board',
  positions = {},
  motion,
  effectSeat,
  onInspect,
  revenge,
  revengeMode = Boolean(revenge),
  targets = [],
  eligible = [],
  interactionKey,
  numbered = [],
  linkedPiece,
  onLink,
  theme,
  captureMotions = [],
  impact,
}: {
  pieces?: BoardPiece[];
  legal?: string[];
  onMove?: (id: string) => void;
  unlocked?: number[];
  active?: number;
  effect?: string;
  label?: string;
  positions?: Record<string, Position>;
  motion?: PieceMotion | null;
  effectSeat?: number;
  onInspect?: (message: string) => void;
  revenge?: RevengeState;
  revengeMode?: boolean;
  targets?: Position[];
  eligible?: string[];
  interactionKey?: number;
  numbered?: string[];
  linkedPiece?: string;
  onLink?: (id: string | null) => void;
  theme?: BoardStyle;
  captureMotions?: PieceMotion[];
  impact?: {
    key: number;
    at: Position;
    seat: number;
    halki: boolean;
    count: number;
  } | null;
}) {
  const preferredTheme = useBoardStyle();
  const premium = (theme ?? preferredTheme) === 'premium';
  const uid = useId().replaceAll(':', '');
  const at = (n: number) => 36 + n * 32;
  const renderPieces = pieces.map((p) => ({
    ...p,
    position: positions[p.id] ?? p.position,
  }));
  const layout = stackPresentation(
    renderPieces,
    legal,
    active,
    numbered,
    [motion?.pieceId, ...captureMotions.map((m) => m.pieceId)].filter(
      (id): id is string => Boolean(id),
    ),
  );
  const [picker, setPicker] = useState<{
    key: string;
    turn?: number;
    legal: string;
  } | null>(null);
  const pickerItems =
    picker && picker.turn === interactionKey && picker.legal === legal.join('|')
      ? layout.filter((p) => p.key === picker.key && p.selectable)
      : [];
  const choose = (id: string) => {
    setPicker(null);
    onMove?.(id);
  };
  // An SVG group preserves the accessible child piece buttons; HTML fieldsets cannot replace the SVG root.
  /* oxlint-disable jsx-a11y/prefer-tag-over-role -- SVG must preserve interactive child pieces. */
  return (
    <div className="board-interaction">
      <svg
        className={`movo-board board-${premium ? 'premium' : 'classic'} ${effect ?? ''}`}
        data-board-theme={premium ? 'premium' : 'classic'}
        viewBox="0 0 520 534"
        role="group"
        aria-label={label}
      >
        <defs>
          <linearGradient id={`${uid}-wood`} x1="0" y1="0" x2=".8" y2="1">
            <stop stopColor={premium ? '#f1ecdf' : '#e5d8c2'} />
            <stop offset="1" stopColor={premium ? '#d9d1bc' : '#c9b89a'} />
          </linearGradient>
          <linearGradient id={`${uid}-edge`} x2="0" y2="1">
            <stop stopColor={premium ? '#746b56' : '#bcac8e'} />
            <stop offset="1" stopColor={premium ? '#333c31' : '#786b55'} />
          </linearGradient>
          <radialGradient id={`${uid}-shine`} cx=".3" cy=".2" r=".8">
            <stop stopColor="white" stopOpacity=".4" />
            <stop offset=".5" stopColor="white" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity=".22" />
          </radialGradient>
          <pattern
            id={`${uid}-grain`}
            width="7"
            height="7"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r=".4" fill="#6c5842" opacity=".13" />
            <circle cx="4" cy="5" r=".3" fill="#fff" opacity=".5" />
          </pattern>
          <filter
            id={`${uid}-shadow`}
            x="-100%"
            y="-100%"
            width="300%"
            height="300%"
          >
            <feDropShadow
              dx="0"
              dy="3"
              stdDeviation="2"
              floodColor="#392c1c"
              floodOpacity=".3"
            />
          </filter>
        </defs>
        {premium && active !== undefined && (
          <path
            className="board-side-cue"
            d="M52 519H468"
            transform={`rotate(${active * 90} 260 260)`}
            stroke={COLORS[active]}
            strokeWidth="4"
            strokeLinecap="round"
          />
        )}
        <rect
          x="5"
          y="15"
          width="510"
          height="510"
          rx="25"
          fill="#1a1b15"
          opacity=".35"
        />
        <rect
          x="5"
          y="9"
          width="510"
          height="511"
          rx="25"
          fill={`url(#${uid}-edge)`}
        />
        <rect
          x="5"
          y="4"
          width="510"
          height="510"
          rx="24"
          fill={`url(#${uid}-wood)`}
          stroke="#f4ead8"
          strokeWidth="2"
        />
        <rect
          x="5"
          y="4"
          width="510"
          height="510"
          rx="24"
          fill={`url(#${uid}-grain)`}
        />
        <rect
          x="18"
          y="17"
          width="484"
          height="484"
          rx="15"
          fill="none"
          stroke="#a99572"
          strokeOpacity=".5"
        />
        {[0, 1, 2, 3].map((s) => {
          const cells = [0, 1, 2, 3].map((i) => baseCell(s as Seat, i));
          const cx = cells.reduce((sum, c) => sum + at(c.x), 0) / 4,
            cy = cells.reduce((sum, c) => sum + at(c.y), 0) / 4;
          return (
            <g
              key={s}
              className={`board-base ${active === s ? 'base-active' : ''}`}
            >
              <rect
                x={cx - 73}
                y={cy - 72}
                width="146"
                height="146"
                rx="27"
                fill={COLORS[s]}
                fillOpacity={premium ? '.12' : '.065'}
                stroke={COLORS[s]}
                strokeOpacity={active === s ? '.8' : '.3'}
                strokeWidth={active === s ? '2' : '1'}
              />
              <text
                x={cx}
                y={cy - 50}
                textAnchor="middle"
                fill={COLORS[s]}
                fontSize="9"
                fontWeight="700"
                letterSpacing="3"
              >
                {['EMBER', 'GROVE', 'GOLD', 'TIDE'][s]}
              </text>
              {cells.map((c, i) => (
                <g key={i}>
                  <circle
                    cx={at(c.x)}
                    cy={at(c.y)}
                    r="21"
                    fill="#b0a18a"
                    fillOpacity=".12"
                    stroke={COLORS[s]}
                    strokeOpacity=".25"
                  />
                  <circle
                    cx={at(c.x)}
                    cy={at(c.y)}
                    r="16.5"
                    fill="none"
                    stroke="#fff"
                    strokeOpacity=".35"
                  />
                </g>
              ))}
              <text
                x={cx}
                y={cy + 64}
                textAnchor="middle"
                fill="#847962"
                fontSize="7"
                letterSpacing="1.5"
              >
                {unlocked.includes(s) ? 'HOME UNLOCKED' : 'KNOCK TO UNLOCK'}
              </text>
            </g>
          );
        })}
        {TRACK.map((t) => (
          <g key={t.id} className="board-tile" data-square={t.id}>
            <title>
              {(t.safe ? 'Safe space ' : 'Shared route ') + (t.index + 1)}
            </title>
            <rect
              x={at(t.x) - 14}
              y={at(t.y) - 14}
              width="28"
              height="28"
              rx="7"
              fill={
                t.safe
                  ? premium
                    ? '#c6cab4'
                    : '#cfc3ad'
                  : premium
                    ? '#faf6eb'
                    : '#f7f0e2'
              }
              stroke="#b8a88d"
              strokeWidth=".8"
            />
            {t.safe && (
              <g
                transform={`translate(${at(t.x)},${at(t.y)})`}
                fill="none"
                stroke="#8a7d65"
                strokeWidth="1.5"
              >
                <path
                  d={
                    premium
                      ? 'M0 -8 7 -5V1Q7 6 0 9Q-7 6-7 1V-5Z'
                      : 'M0 -7 L6 -3 L6 3 L0 7 L-6 3 L-6 -3 Z'
                  }
                />
                {premium ? <path d="m-3 0 2 2 4-4" /> : <circle r="2" />}
              </g>
            )}
          </g>
        ))}
        {HOME_GATES.map((index, s) => {
          const t = TRACK[index],
            open = unlocked.includes(s);
          return (
            <g
              key={`gate-${s}`}
              className={`home-gate ${open ? 'gate-open' : ''} ${effectSeat === s ? 'gate-react' : ''}`}
              transform={`translate(${at(t.x)} ${at(t.y)}) rotate(${s * 90})`}
            >
              <title>{`Home Gate ${s + 1} · Exposed and knockable · ${open ? 'Home unlocked' : 'Get 1 knock to enter'}`}</title>
              <rect
                x="-14"
                y="-14"
                width="28"
                height="28"
                rx="5"
                fill="#ddc9a5"
                stroke={COLORS[s]}
                strokeWidth="1.6"
              />
              <path
                d="M-10 -6v-5h20v5M-7 -8v16M7 -8v16"
                fill="none"
                stroke={COLORS[s]}
                strokeWidth="2"
              />
              <path
                className="gate-bar"
                d={open ? 'M-7 0l-3 -6M7 0l3 -6' : 'M-7 0h14'}
                fill="none"
                stroke={COLORS[s]}
                strokeWidth="2.4"
              />
              {premium && !open && (
                <path
                  d="M-3 1V-2a3 3 0 0 1 6 0V1M-4 1h8v7h-8Z"
                  stroke={COLORS[s]}
                  fill="#eee4cd"
                  strokeWidth="1.2"
                />
              )}
            </g>
          );
        })}
        {[0, 1, 2, 3].flatMap((s) =>
          Array.from({ length: LANE_LENGTH }, (_, i) => {
            const c = laneCell(s as Seat, i);
            return (
              <g
                key={`${s}-${i}`}
                className={`board-lane ${unlocked.includes(s) ? 'lane-unlocked' : ''} ${effectSeat === s ? 'lane-react' : ''}`}
              >
                <rect
                  x={at(c.x) - 14}
                  y={at(c.y) - 14}
                  width="28"
                  height="28"
                  rx="7"
                  fill={COLORS[s]}
                  fillOpacity={
                    unlocked.includes(s)
                      ? premium
                        ? '.76'
                        : '.55'
                      : premium
                        ? '.35'
                        : '.22'
                  }
                  stroke={COLORS[s]}
                  strokeOpacity=".5"
                />
                <circle
                  cx={at(c.x)}
                  cy={at(c.y)}
                  r="2"
                  fill={COLORS[s]}
                  opacity=".6"
                />
              </g>
            );
          }),
        )}
        <rect
          x="225"
          y="225"
          width="70"
          height="70"
          rx="19"
          fill={premium ? '#b8b59e' : '#d4c7ae'}
          stroke="#b9a686"
        />
        <path
          d="M260 232 L282 260 L260 288 L238 260 Z"
          fill={premium ? '#304438' : '#eee3ce'}
          stroke="#b5a17c"
        />
        <text
          x="260"
          y="264"
          textAnchor="middle"
          fill={premium ? '#f3e9cf' : '#7a694c'}
          fontSize="9"
          fontWeight="800"
          letterSpacing="1"
        >
          MOVO
        </text>
        {revenge?.shields.map((shield) => {
          const c = TRACK[shield.index],
            contested = revenge.contests.some((x) => x.index === shield.index);
          return (
            <g
              key={shield.index}
              className={`team-shield ${contested ? 'is-contested' : ''}`}
              transform={`translate(${at(c.x)} ${at(c.y)})`}
            >
              <title>
                {shield.halkiTeams?.length
                  ? 'Halki-protected Team Shield'
                  : shield.teams.length === 2
                    ? 'Double-contested Team Shields'
                    : contested
                      ? 'Contested Team Shield'
                      : 'Team Shield'}{' '}
                · Team {shield.teams.join(' + ')}
              </title>
              <rect
                x="-19"
                y="-19"
                width="38"
                height="38"
                rx="12"
                fill="none"
                stroke={
                  shield.halkiTeams?.length
                    ? '#863c63'
                    : contested
                      ? '#bd692e'
                      : '#367366'
                }
                strokeWidth="2"
                strokeDasharray={contested ? '4 3' : undefined}
              />
              <path
                d="M-4 -22h8v4l-4 3-4-3Z"
                fill="#eee2ca"
                stroke="#367366"
                strokeWidth="1.2"
              />
            </g>
          );
        })}
        {revenge?.contests
          .filter((contest) => !contest.shields.length)
          .map((contest) => {
            const c = TRACK[contest.index];
            return (
              <g
                key={`contest-${contest.index}`}
                transform={`translate(${at(c.x)} ${at(c.y)})`}
              >
                <title>
                  Contested square ·{' '}
                  {contest.kind === 'HALKI'
                    ? 'Halki capture limit: two defenders'
                    : 'Stack exceeds a normal attack'}
                </title>
                <rect
                  x="-19"
                  y="-19"
                  width="38"
                  height="38"
                  rx="12"
                  fill="none"
                  stroke="#bd692e"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                />
              </g>
            );
          })}
        {targets.map((p, i) => {
          const c = coordinates(p, 0, 0);
          return (
            <circle
              key={i}
              className="halki-target"
              cx={at(c.x)}
              cy={at(c.y)}
              r="20"
              fill="none"
              stroke="#863c63"
              strokeWidth="3"
              strokeDasharray="4 3"
            />
          );
        })}
        {layout.map(
          ({
            piece: p,
            key,
            count,
            x: offset,
            y: offsetY,
            selectable: isLegal,
            choices,
            top,
            occupants,
          }) => {
            const c = coordinates(p.position, p.seat, p.number),
              locked =
                p.position.kind === 'HOME_GATE_LOCKED' &&
                !unlocked.includes(p.seat);
            const halki = p.position.kind.startsWith('HALKI_');
            let numberX = 12,
              numberY = 14;
            if (p.position.kind === 'HOME') {
              // Keep Finish labels toward the centre, clear of the outer route.
              numberY = -14;
              for (let n = 0; n < (p.position.homeSeat ?? p.seat); n++)
                [numberX, numberY] = [-numberY, numberX];
            }
            return (
              <PieceToken
                key={p.id}
                piece={p}
                x={at(c.x) + offset}
                y={at(c.y) + offsetY}
                motion={
                  captureMotions.find((m) => m.pieceId === p.id) ??
                  (motion?.pieceId === p.id ? motion : null)
                }
                className={`${isLegal ? 'is-legal' : ''} ${top ? 'stack-top' : 'stack-under'} ${linkedPiece === p.id ? 'is-linked' : ''} ${numbered.includes(p.id) ? 'is-numbered' : ''} ${halki ? 'is-halki' : ''} ${locked ? 'gate-waiting' : ''} ${effect === 'home-unlock' && effectSeat === p.seat ? 'unlock-react' : ''}`}
              >
                {!top ? (
                  <g
                    className="stack-layer"
                    aria-label={`${MARKS[p.seat]} Piece ${p.number + 1}, underneath stack`}
                  >
                    <ellipse
                      cy="6"
                      rx="14"
                      ry="7"
                      fill={COLORS[p.seat]}
                      stroke="#2e3428"
                      strokeWidth="1"
                    />
                    <path
                      d="M-12 6Q0 14 12 6"
                      fill="none"
                      stroke="#fff6dc"
                      strokeOpacity=".55"
                      strokeWidth="1.1"
                    />
                  </g>
                ) : (
                  <>
                    <g
                      className={`piece-face ${isLegal || (locked && onInspect) ? 'is-interactive' : 'is-passive'}`}
                      role={onMove ? 'button' : undefined}
                      tabIndex={
                        isLegal || (locked && onInspect) ? 0 : undefined
                      }
                      aria-label={`${['Terracotta diamond', 'Sage star', 'Ochre triangle', 'Slate waves'][p.seat]} ${halki ? 'Halki ' : ''}piece ${p.number + 1}${p.hasUsedHalki && !halki ? ', Halki life used' : eligible.includes(p.id) ? ', Halki eligible' : ''}${locked ? ', Home locked. Get 1 knock. Gate is not safe.' : isLegal ? ', move available' : ''}`}
                      aria-disabled={onMove ? !isLegal && !locked : undefined}
                      aria-haspopup={
                        isLegal && choices.length > 1 ? 'true' : undefined
                      }
                      aria-expanded={
                        isLegal && choices.length > 1
                          ? pickerItems.some((item) => item.piece.id === p.id)
                          : undefined
                      }
                      onPointerEnter={() => isLegal && onLink?.(p.id)}
                      onPointerLeave={() => onLink?.(null)}
                      onFocus={() => isLegal && onLink?.(p.id)}
                      onBlur={() => onLink?.(null)}
                      onClick={() =>
                        locked
                          ? onInspect?.(
                              'HOME LOCKED · GET 1 KNOCK. This gate is not safe.',
                            )
                          : isLegal &&
                            (choices.length > 1
                              ? setPicker({
                                  key,
                                  turn: interactionKey,
                                  legal: legal.join('|'),
                                })
                              : choose(p.id))
                      }
                      onKeyDown={(e) => {
                        if (
                          (isLegal || locked) &&
                          (e.key === 'Enter' || e.key === ' ')
                        ) {
                          e.preventDefault();
                          if (locked)
                            onInspect?.(
                              'HOME LOCKED · GET 1 KNOCK. This gate is not safe.',
                            );
                          else if (choices.length > 1)
                            setPicker({
                              key,
                              turn: interactionKey,
                              legal: legal.join('|'),
                            });
                          else choose(p.id);
                        }
                      }}
                    >
                      {count > 1 && (
                        <title>{`Stack: ${occupants.map((o) => `${MARKS[o.seat]} Piece ${o.number + 1}`).join(' · ')}`}</title>
                      )}
                      <circle
                        className={
                          count > 1 ? 'piece-hit stacked-hit' : 'piece-hit'
                        }
                        r="21"
                        fill="transparent"
                      />
                      {halki && (
                        <g className="halki-marker">
                          <title>HALKI · Reverse movement · Strength 2</title>
                          <circle
                            r="17"
                            fill="none"
                            stroke={COLORS[p.seat]}
                            strokeWidth="2.5"
                            strokeDasharray="26 5"
                          />
                          <path
                            d="M-14 -11l-5 1 1-5"
                            fill="none"
                            stroke={COLORS[p.seat]}
                            strokeWidth="2"
                          />
                          <rect
                            x="5"
                            y="-22"
                            width="15"
                            height="13"
                            rx="5"
                            fill="#25271e"
                          />
                          <text
                            x="12.5"
                            y="-12"
                            textAnchor="middle"
                            fontSize="8"
                            fill="#fff4d7"
                          >
                            H
                          </text>
                        </g>
                      )}
                      {p.hasUsedHalki && !halki && (
                        <g>
                          <title>
                            One Halki life used · cannot activate again
                          </title>
                          <circle
                            cx="10"
                            cy="-10"
                            r="3.5"
                            fill="#716650"
                            stroke="#eee2ca"
                            strokeWidth="1"
                          />
                        </g>
                      )}
                      {halki && 'homeSeat' in p.position && (
                        <title>
                          Return to the invaded{' '}
                          {
                            ['Terracotta', 'Sage', 'Ochre', 'Slate'][
                              p.position.homeSeat!
                            ]
                          }{' '}
                          Home after a full reverse lap
                        </title>
                      )}
                      {!halki && eligible.includes(p.id) && (
                        <circle
                          r="17"
                          fill="none"
                          stroke={COLORS[p.seat]}
                          strokeDasharray="2 4"
                          strokeWidth="1.3"
                        />
                      )}
                      {isLegal && (
                        <circle
                          className="legal-ring"
                          r="18"
                          fill="none"
                          stroke={COLORS[p.seat]}
                          strokeWidth="1.5"
                        />
                      )}
                      <ellipse
                        cy="5"
                        rx="13"
                        ry="10"
                        fill="#473b2d"
                        opacity=".2"
                      />
                      <path
                        d="M-12 -2 C-12 -14 12 -14 12 -2 L13 4 C12 16 -12 16 -13 4 Z"
                        fill={COLORS[p.seat]}
                        stroke="#473b2d"
                        strokeOpacity=".25"
                      />
                      <ellipse
                        cy="-3"
                        rx="11.5"
                        ry="10"
                        fill={COLORS[p.seat]}
                      />
                      <ellipse
                        className="token-rim"
                        cy="-3"
                        rx="12"
                        ry="10.5"
                        fill="none"
                        stroke="#fff5d6"
                        strokeOpacity=".6"
                        strokeWidth="1.3"
                      />
                      <path
                        d="M-12 -2 C-12 -14 12 -14 12 -2 L13 4 C12 16 -12 16 -13 4 Z"
                        fill={`url(#${uid}-shine)`}
                      />
                      <ellipse
                        cy="-3"
                        rx="8.5"
                        ry="7"
                        fill="none"
                        stroke="#fff"
                        strokeOpacity=".35"
                        strokeWidth=".7"
                      />
                      <text
                        y="1"
                        textAnchor="middle"
                        fill="#fff6df"
                        fontSize="11"
                        fontWeight="bold"
                        aria-hidden="true"
                      >
                        {MARKS[p.seat]}
                      </text>
                      {numbered.includes(p.id) && (
                        <g className="piece-number" aria-hidden="true">
                          <circle
                            cx={numberX}
                            cy={numberY}
                            r="10"
                            fill="#23271e"
                            stroke="#f3ebd1"
                            strokeWidth="1.2"
                          />
                          <text
                            x={numberX}
                            y={numberY + 5}
                            textAnchor="middle"
                            fill="#fff5d6"
                            fontSize="14"
                            fontWeight="700"
                          >
                            {p.number + 1}
                          </text>
                        </g>
                      )}
                      {locked && (
                        <g className="piece-lock" transform="translate(10 -13)">
                          <title>
                            HOME LOCKED · GET 1 KNOCK · Gate is not safe
                          </title>
                          <circle
                            r="8"
                            fill="#28251f"
                            stroke="#f3dca7"
                            strokeWidth=".8"
                          />
                          <path
                            d="M-2 -1V-3a2 2 0 0 1 4 0v2M-3 -1h6v5h-6Z"
                            fill="none"
                            stroke="#f3dca7"
                            strokeWidth="1.2"
                          />
                        </g>
                      )}
                    </g>
                  </>
                )}
              </PieceToken>
            );
          },
        )}
        {impact &&
          (() => {
            const c = coordinates(impact.at, impact.seat as Seat, 0);
            return (
              <g
                key={impact.key}
                className={`capture-impact ${impact.halki ? 'halki-impact' : ''}`}
                transform={`translate(${at(c.x)} ${at(c.y)})`}
                aria-label={`${impact.count} ${impact.count === 1 ? 'piece' : 'pieces'} captured`}
              >
                <circle
                  r="20"
                  fill="none"
                  stroke={COLORS[impact.seat]}
                  strokeWidth="3"
                />
                <path
                  d="M-26 0h-7M26 0h7M0-26v-7M0 26v7"
                  stroke={COLORS[impact.seat]}
                  strokeWidth="2"
                />
                {impact.count > 1 && (
                  <text
                    y="-27"
                    textAnchor="middle"
                    fontSize="12"
                    fill="#302b21"
                  >
                    ×{impact.count}
                  </text>
                )}
              </g>
            );
          })()}
        <text
          x="260"
          y="494"
          textAnchor="middle"
          fill="#897657"
          fontSize="6"
          letterSpacing="3"
        >
          {revengeMode
            ? 'REVENGE · WINNING ISN’T SAFE'
            : 'THE ORIGINAL KNOCKOUT BOARD'}
        </text>
      </svg>
      {onMove && pickerItems.length > 1 && (
        <div
          className="stack-picker"
          role="group"
          aria-label="Choose a stacked piece"
        >
          <div>
            <strong>Choose your piece</strong>
            <button
              aria-label="Close piece choices"
              onClick={() => setPicker(null)}
            >
              ×
            </button>
          </div>
          <div>
            {pickerItems.map(({ piece: p }) => (
              <button key={p.id} onClick={() => choose(p.id)}>
                <span style={{ color: COLORS[p.seat] }}>{MARKS[p.seat]}</span>
                Piece {p.number + 1}
                <small>
                  {p.position.kind.startsWith('HALKI_') ? 'HALKI' : 'NORMAL'}
                </small>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

// WAAPI runs each hop between authoritative tile centers without React updates per frame.
const PieceToken = memo(function PieceToken({
  piece,
  x,
  y,
  motion,
  className,
  children,
}: {
  piece: BoardPiece;
  x: number;
  y: number;
  motion: PieceMotion | null;
  className: string;
  children: ReactNode;
}) {
  const root = useRef<SVGGElement>(null),
    body = useRef<SVGGElement>(null),
    previous = useRef(`translate(${x}px, ${y}px)`);
  const target = `translate(${x}px, ${y}px)`;
  useLayoutEffect(() => {
    const from = previous.current;
    previous.current = target;
    if (!motion || !root.current || !body.current) return;
    const travel = root.current.animate(
      [{ transform: from }, { transform: target }],
      {
        duration: motion.duration,
        delay: motion.delay ?? 0,
        fill: 'backwards',
        easing:
          motion.kind === 'return' ? 'cubic-bezier(.2,.65,.3,1)' : 'linear',
      },
    );
    const height = motion.reduced ? 0 : motion.kind === 'return' ? 38 : 6;
    const lift = body.current.animate(
      [
        { transform: 'translateY(0) scale(1)', offset: 0 },
        {
          transform: `translateY(-${height}px) scale(${motion.reduced ? 1 : 1.04})`,
          offset: 0.45,
        },
        {
          transform: `translateY(0) scale(${motion.final && !motion.reduced ? '1.08,.92' : '1'})`,
          offset: 0.87,
        },
        { transform: 'translateY(0) scale(1)', offset: 1 },
      ],
      {
        duration: motion.duration,
        delay: motion.delay ?? 0,
        fill: 'backwards',
        easing: 'ease-in-out',
      },
    );
    return () => {
      travel.cancel();
      lift.cancel();
    };
  }, [motion, target]);
  return (
    <g
      ref={root}
      className={`piece-position ${className}`}
      data-piece={piece.id}
      data-moving={Boolean(motion)}
      data-position={positionKey(piece.position, piece.seat, piece.number)}
      style={{ transform: target }}
    >
      <g ref={body} className="piece-body">
        {children}
      </g>
    </g>
  );
});

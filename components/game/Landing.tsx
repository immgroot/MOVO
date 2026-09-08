'use client';
import {
  ArrowUpRight,
  ArrowRight,
  Users,
  Volume2,
  CircleHelp,
  ChevronDown,
  Monitor,
  Smartphone,
  Tablet,
  LockKeyhole,
  MoveUpRight,
} from 'lucide-react';
import { Board } from './Board';
import type { ReactNode } from 'react';
export default function Landing({
  onPlay,
  onHow,
  onSettings,
  accountMenu,
}: {
  onPlay: (mode: 'play' | 'create' | 'join') => void;
  onHow: () => void;
  onSettings: () => void;
  accountMenu?: ReactNode;
}) {
  return (
    <main className="app-shell">
      <header className="site-header">
        <a href="#play" className="wordmark">
          movo<span>®</span>
        </a>
        <nav>
          <a className="nav-active" href="#play">
            Play
          </a>
          <button className="nav-button" onClick={onHow}>
            How to play <ArrowUpRight size={13} />
          </button>
        </nav>
        <div className="header-actions">
          <span className="edition">THE TABLE IS OPEN</span>
          {accountMenu}
          <button
            className="icon-button"
            aria-label="Sound settings"
            onClick={onSettings}
          >
            <Volume2 size={19} />
          </button>
        </div>
      </header>
      <section id="play" className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="small-cross">✳</span> A FAMILIAR GAME. A NEW
            RIVALRY.
          </div>
          <div className="mode-chip">
            <i /> KNOCKOUT <span>01</span>
          </div>
          <h1>
            No knock.
            <br />
            <em>No home.</em>
          </h1>
          <p className="hero-description">
            A little luck. A little strategy.
            <br />A very good reason to get even.
          </p>
          <button
            className="primary-button hero-play"
            onClick={() => onPlay('play')}
          >
            Play now <ArrowUpRight size={23} />
          </button>
          <div className="secondary-actions">
            <button onClick={() => onPlay('create')}>
              Create room <Users size={16} />
            </button>
            <span />
            <button onClick={() => onPlay('join')}>
              Join room <ArrowRight size={17} />
            </button>
          </div>
          <p className="guest-note">
            2–4 players <b>·</b> Play free <b>·</b> No account needed
          </p>
        </div>
        <div className="hero-scene">
          <div className="scene-orbit orbit-one" />
          <div className="scene-orbit orbit-two" />
          <div className="scene-topline">
            <span>GOOD FRIENDS. QUESTIONABLE ALLIANCES.</span>
            <MoveUpRight size={17} />
          </div>
          <div className="hero-board-wrap">
            <Board />
          </div>
          <div className="floating-die" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <div className="scene-caption">
            <span className="status-dot" /> ONE KNOCK CHANGES EVERYTHING.
            <span className="caption-rule" />
            YOUR NEXT GAME NIGHT
          </div>
          <span className="scene-coordinate">
            EST. 2026 &nbsp; / &nbsp; BUILT FOR RIVALRIES
          </span>
        </div>
      </section>
      <section id="how" className="how-strip">
        <div className="how-intro">
          <span className="eyebrow">THE GAME PLAN</span>
          <h2>
            Simple rules.
            <br />
            Personal consequences.
          </h2>
        </div>
        <div className="step">
          <span>01</span>
          <h3>Roll.</h3>
          <p>Roll a six. Make your entrance.</p>
        </div>
        <div className="step">
          <span>02</span>
          <h3>Knock.</h3>
          <p>Land on a rival. Send them packing.</p>
        </div>
        <div className="step">
          <span>03</span>
          <h3>Unlock.</h3>
          <p>First knock opens your way home.</p>
        </div>
        <div className="step">
          <span>04</span>
          <h3>Bring it home.</h3>
          <p>Get all four home. Own the table.</p>
        </div>
      </section>
      <section className="below-table">
        <div>
          <LockKeyhole size={22} />
          <h2>Home is earned.</h2>
          <p>
            Your first knockout unlocks all four of your pieces.
            <br />
            No knock? Your piece stops at an exposed Home Gate.
          </p>
          <button className="text-button" onClick={onHow}>
            Learn the rules <CircleHelp size={17} />
          </button>
        </div>
        <div className="device-note">
          <div>
            <Monitor />
            <Smartphone />
            <Tablet />
          </div>
          <h2>Different screens. Same table.</h2>
          <p>Phone, laptop, tablet. Bring your people.</p>
          <span>PASS THE LINK. START SOMETHING.</span>
        </div>
      </section>
      <footer>
        <a href="#play" className="wordmark small">
          movo<span>®</span>
        </a>
        <span className="creator-credit">
          Created by <b>@immgroot</b>
          <small>Discord @immgroot</small>
        </span>
        <a href="#play">
          Back to the table <ChevronDown size={14} />
        </a>
      </footer>
    </main>
  );
}

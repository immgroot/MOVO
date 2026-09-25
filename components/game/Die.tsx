'use client';
import { useLayoutEffect, useState } from 'react';
import { diceFace } from '../../shared/dice-presentation';
const pips: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
export function Die({
  value,
  reduced = false,
  disabled,
  rolling,
  onRoll,
}: {
  value: number | null;
  reduced?: boolean;
  disabled: boolean;
  rolling: boolean;
  onRoll: () => void;
}) {
  const [frame, setFrame] = useState({ rolling, value, elapsed: 0 });
  const changed = frame.rolling !== rolling || frame.value !== value;
  if (changed) setFrame({ rolling, value, elapsed: 0 });
  useLayoutEffect(() => {
    if (!rolling || reduced) return;
    const start = performance.now();
    const id = setInterval(
      () => setFrame({ rolling, value, elapsed: performance.now() - start }),
      30,
    );
    return () => clearInterval(id);
  }, [rolling, reduced, value]);
  const face = diceFace(value, changed ? 0 : frame.elapsed, rolling, reduced);
  return (
    <button
      className={`die-button ${rolling ? 'rolling' : ''} ${reduced ? 'die-reduced' : ''}`}
      disabled={disabled}
      onClick={onRoll}
      aria-label={
        rolling
          ? 'Rolling…'
          : disabled
            ? `Die result: ${value ?? 'not rolled'}`
            : 'Roll the die'
      }
    >
      <span className="die-object" data-visible-face={face} aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <i
            key={i}
            className={pips[face].includes(i) ? 'pip' : 'pip hidden'}
          />
        ))}
      </span>
      <span className="die-caption">
        {rolling
          ? 'ROLLING'
          : disabled
            ? value
              ? `ROLLED ${value}`
              : 'WAITING'
            : 'TAP TO ROLL'}
      </span>
    </button>
  );
}

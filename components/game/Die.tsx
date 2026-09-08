'use client';
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
  disabled,
  rolling,
  onRoll,
}: {
  value: number | null;
  disabled: boolean;
  rolling: boolean;
  onRoll: () => void;
}) {
  return (
    <button
      className={`die-button ${rolling ? 'rolling' : ''}`}
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
      <span className="die-object">
        {Array.from({ length: 9 }, (_, i) => (
          <i
            key={i}
            className={pips[value ?? 6].includes(i) ? 'pip' : 'pip hidden'}
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

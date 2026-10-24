const UNITS: readonly (readonly [string, number])[] = [
  ["y", 31_536_000],
  ["d", 86_400],
  ["h", 3_600],
  ["min", 60],
  ["s", 1],
];

/** 45 -> "45 s", 90 -> "1.5 min", 7_200 -> "2 h", 4e8 -> "12.7 y". */
export function formatDuration(seconds: number): string {
  const [unit, size] = UNITS.find(([, unitSeconds]) => seconds >= unitSeconds) ?? UNITS[UNITS.length - 1];
  const value = seconds / size;
  const shown = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${shown.toLocaleString("en-US")} ${unit}`;
}

/** 8 -> "x8", 65_536 -> "x65,536", 0.25 -> "x1/4", 0.99 -> "x1", 2.4 -> "x2.4". */
export function formatStretch(stretch: number): string {
  if (stretch < 1) {
    const inverse = 1 / stretch;
    const shownInverse = inverse < 10 ? Math.round(inverse * 10) / 10 : Math.round(inverse);
    return shownInverse <= 1 ? "x1" : `x1/${shownInverse}`;
  }
  const shown = stretch < 10 ? Math.round(stretch * 10) / 10 : Math.round(stretch);
  return `x${shown.toLocaleString("en-US")}`;
}

/** 120 -> "1 min here = 2 h at the surface". */
export function exchangeSentence(stretch: number): string {
  return `1 min here = ${formatDuration(60 * stretch)} at the surface`;
}

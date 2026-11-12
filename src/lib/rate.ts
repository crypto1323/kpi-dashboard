export function rate(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

// 初診率は70%以上、成約率は30%以上を「良好」とする社内基準値。
export const SECOND_VISIT_GOOD_THRESHOLD = 70;
export const CONTRACT_GOOD_THRESHOLD = 30;

/** Conditional-formatting color for a rate cell: green at/above the goal, red
 * below. Rounds to 1 decimal first — the same precision formatPercent()
 * displays — so a value like 69.96% (shown as "70.0%") reads as green, not
 * red from comparing the unrounded number. */
export function rateToneClass(percent: number, goodThreshold: number, hasData: boolean) {
  if (!hasData) return "text-muted-foreground";
  const displayed = Math.round(percent * 10) / 10;
  return displayed >= goodThreshold ? "text-green-600" : "text-red-600";
}

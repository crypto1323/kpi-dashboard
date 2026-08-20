/** A single ratio against a limit — same-ramp track, per the dataviz skill's guidance to avoid a 2-slice pie. */
export function Meter({ label, value }: { label: string; value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{clamped.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#b7d3f6" }}>
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${clamped}%`, background: "#2a78d6" }}
        />
      </div>
    </div>
  );
}

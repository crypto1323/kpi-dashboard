const TONE_CLASSES = {
  blue: { bg: "bg-blue-50", text: "text-blue-600" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  violet: { bg: "bg-violet-50", text: "text-violet-600" },
  amber: { bg: "bg-amber-50", text: "text-amber-600" },
} as const;

export type StatTileTone = keyof typeof TONE_CLASSES;

export function StatTile({
  label,
  value,
  tone = "blue",
}: {
  label: string;
  value: string;
  tone?: StatTileTone;
}) {
  const { bg, text } = TONE_CLASSES[tone];
  return (
    <div className={`rounded-lg ${bg} px-4 py-3`}>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-3xl font-bold tracking-tight ${text}`}>{value}</p>
    </div>
  );
}

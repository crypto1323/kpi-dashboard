export function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

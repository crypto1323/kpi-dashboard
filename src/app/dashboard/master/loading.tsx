export default function Loading() {
  return (
    <div className="animate-pulse pt-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-5 w-32 rounded bg-muted" />
        <div className="h-8 w-28 rounded bg-muted" />
      </div>
      <div className="h-64 rounded-xl border bg-card shadow-md" />
    </div>
  );
}

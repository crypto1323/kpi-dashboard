/** Shown instantly by Next.js while a route segment's data is still loading,
 * so tapping a nav tab never looks frozen — the shell paints right away and
 * the real content swaps in when it resolves. */
export function PageLoadingSkeleton() {
  return (
    <div className="mx-auto flex max-w-4xl animate-pulse flex-col gap-6 pb-12">
      <div className="flex items-center justify-between">
        <div className="h-6 w-40 rounded bg-muted" />
        <div className="h-8 w-32 rounded bg-muted" />
      </div>
      <div className="h-24 rounded-xl border bg-card shadow-md" />
      <div className="h-64 rounded-xl border bg-card shadow-md" />
    </div>
  );
}

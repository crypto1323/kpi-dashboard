import { AppHeader } from "@/components/app-header";

/** No auth check here on purpose — see src/app/dashboard/master/layout.tsx
 * for why layout-level checks are unsafe (Next.js caches layouts client-side
 * and doesn't re-run them on navigation). hq-dashboard/page.tsx checks
 * adminGateOrNull() itself. */
export default function HqDashboardLayout({ children }: LayoutProps<"/hq-dashboard">) {
  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader />
      <main className="flex-1 bg-muted/20 p-6">{children}</main>
    </div>
  );
}

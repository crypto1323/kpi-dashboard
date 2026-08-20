import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/dal";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

/** Deliberately its own header/shell, distinct from src/app/dashboard/layout.tsx,
 * so this reads as a separate "sheet" (本部ダッシュボード) rather than another
 * tab inside the store-facing area. */
export default async function HqDashboardLayout({
  children,
}: LayoutProps<"/hq-dashboard">) {
  const profile = await getCurrentProfile();
  if (profile.role === "staff") {
    redirect("/dashboard/patients");
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-white">本部ダッシュボード</span>
          <span className="text-xs text-slate-400">全社・エリア集計 / 集客費・CPA</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-200 hover:bg-white/10 hover:text-white"
            render={<Link href="/dashboard/patients" />}
          >
            店舗シートへ
          </Button>
          <span className="text-sm text-slate-400">{profile.display_name}</span>
          <form action={logout}>
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="border-slate-600 text-slate-200 hover:bg-white/10 hover:text-white"
            >
              ログアウト
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

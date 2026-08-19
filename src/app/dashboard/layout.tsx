import Link from "next/link";
import { getCurrentProfile } from "@/lib/dal";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const ROLE_LABEL: Record<string, string> = {
  staff: "現場スタッフ",
  area_manager: "エリア長",
  admin: "本部・経営層",
};

export default async function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  const profile = await getCurrentProfile();

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between border-b bg-background px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="font-heading text-sm font-semibold">
            初診患者KPIダッシュボード
          </span>
          <Badge variant="secondary">
            {ROLE_LABEL[profile.role] ?? profile.role}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          {profile.role !== "area_manager" && (
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/patients" />}>
              初診患者の記録
            </Button>
          )}
          {profile.role === "admin" && (
            <Button variant="ghost" size="sm" render={<Link href="/dashboard/master/areas" />}>
              マスタ管理
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {profile.display_name}
          </span>
          <form action={logout}>
            <Button type="submit" variant="outline" size="sm">
              ログアウト
            </Button>
          </form>
        </div>
      </header>
      <main className="flex-1 bg-muted/20 p-6">{children}</main>
    </div>
  );
}

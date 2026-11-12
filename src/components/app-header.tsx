"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { lockEverything } from "@/lib/lock-everything-action";

const NAV_ITEMS = [
  { href: "/dashboard/patients", label: "店舗シート" },
  { href: "/dashboard/report", label: "エリア・全社シート" },
  { href: "/hq-dashboard", label: "本部ダッシュボード" },
  { href: "/dashboard/master/areas", label: "マスタ管理" },
];

/** Same header/tab bar on every screen — navigation itself is never
 * restricted; each destination enforces its own password (店舗シートは店舗
 * ごと、それ以外は共通の本部パスワード) when you actually open it. */
export function AppHeader() {
  const pathname = usePathname();

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-3 shadow-sm">
      <span className="font-heading text-sm font-semibold">初診患者KPIダッシュボード</span>
      <div className="flex items-center gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === "/dashboard/master/areas" && pathname.startsWith("/dashboard/master"));
          return (
            <Button
              key={item.href}
              variant={isActive ? "secondary" : "ghost"}
              size="sm"
              render={<Link href={item.href} />}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
      <form action={lockEverything}>
        <Button type="submit" variant="outline" size="sm">
          ロック
        </Button>
      </form>
    </header>
  );
}

import Link from "next/link";

const NAV = [
  { href: "/dashboard/master/areas", label: "エリア" },
  { href: "/dashboard/master/stores", label: "店舗" },
  { href: "/dashboard/master/channels", label: "流入媒体" },
];

/** No auth check here on purpose — Next.js caches layouts client-side and
 * does not re-run them on sibling navigation, so a layout-level password
 * check can keep showing stale "unlocked" content after the cookie is
 * cleared elsewhere. Every page under here checks adminGateOrNull() itself. */
export default function MasterLayout({ children }: LayoutProps<"/dashboard/master">) {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">マスタ管理</h1>
        <p className="text-sm text-muted-foreground">
          ここで追加・無効化した店舗・エリア・媒体は、現場の入力フォームとダッシュボードに即時反映されます。
        </p>
      </div>
      <nav className="flex gap-1 border-b">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-t-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

import { getCurrentProfile } from "@/lib/dal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>基盤構築が完了しました</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>ログインとRow Level Securityが正しく機能しています。</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="font-medium text-foreground">権限</dt>
            <dd>{profile.role}</dd>
            <dt className="font-medium text-foreground">所属店舗ID</dt>
            <dd>{profile.store_id ?? "—"}</dd>
            <dt className="font-medium text-foreground">所属エリアID</dt>
            <dd>{profile.area_id ?? "—"}</dd>
          </dl>
          <p className="mt-2">
            店舗・エリア・全社ビューはPhase 1以降でここに追加されます。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

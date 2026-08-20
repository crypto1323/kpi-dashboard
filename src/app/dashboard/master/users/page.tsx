import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLE_LABEL: Record<string, string> = {
  staff: "現場スタッフ",
  area_manager: "エリア長",
  admin: "本部・経営層",
};

export default async function UsersPage() {
  const supabase = await createClient();
  const [{ data: profiles }, { data: emails }, { data: stores }, { data: areas }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, role, store_id, area_id")
        .order("display_name"),
      supabase.rpc("list_user_emails"),
      supabase.from("stores").select("id, code, name"),
      supabase.from("areas").select("id, name"),
    ]);

  const emailById = new Map<string, string | null>(
    ((emails ?? []) as { id: string; email: string | null }[]).map((row) => [
      row.id,
      row.email,
    ]),
  );
  const storeById = new Map((stores ?? []).map((store) => [store.id, store]));
  const areaById = new Map((areas ?? []).map((area) => [area.id, area]));

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div>
        <h2 className="text-base font-medium">ユーザー</h2>
        <p className="text-sm text-muted-foreground">
          権限・所属店舗・所属エリアの割り当てを変更できます。アカウントの新規作成はSupabaseダッシュボード（Authentication
          &gt; Users）から行ってください。
        </p>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>メールアドレス</TableHead>
              <TableHead>表示名</TableHead>
              <TableHead>権限</TableHead>
              <TableHead>所属店舗</TableHead>
              <TableHead>所属エリア</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles?.map((profile) => {
              const store = profile.store_id ? storeById.get(profile.store_id) : null;
              const area = profile.area_id ? areaById.get(profile.area_id) : null;
              return (
                <TableRow key={profile.id}>
                  <TableCell className="whitespace-nowrap">
                    {emailById.get(profile.id) ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{profile.display_name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ROLE_LABEL[profile.role] ?? profile.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {store ? `${store.code} ${store.name}` : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {area ? area.name : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/dashboard/master/users/${profile.id}`} />}
                    >
                      編集
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {!profiles?.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  ユーザーがまだいません。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

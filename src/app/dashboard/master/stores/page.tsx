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
import { InlineTextField } from "@/components/inline-field";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { adminGateOrNull } from "@/lib/admin-gate";
import { deleteStore, setStoreActive, updateStoreAccessPassword } from "./actions";

export default async function StoresPage() {
  const gate = await adminGateOrNull("/dashboard/master/stores");
  if (gate) return gate;

  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("*, areas(name)")
    .eq("is_deleted", false)
    .order("code");

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">店舗マスタ</h2>
        <Button size="sm" render={<Link href="/dashboard/master/stores/new" />}>
          + 新規店舗
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>店舗コード</TableHead>
              <TableHead>店舗名</TableHead>
              <TableHead>エリア</TableHead>
              <TableHead>状態</TableHead>
              <TableHead>店舗シートパスワード</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores?.map((store) => {
              const updatePasswordWithId = updateStoreAccessPassword.bind(null, store.id);
              return (
              <TableRow key={store.id}>
                <TableCell className="text-muted-foreground">
                  {store.code}
                </TableCell>
                <TableCell className="font-medium">{store.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {store.areas?.name ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={store.is_active ? "secondary" : "outline"}>
                    {store.is_active ? "有効" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={store.access_password ? "secondary" : "outline"}>
                      {store.access_password ? "設定済み" : "未設定"}
                    </Badge>
                    <InlineTextField
                      action={updatePasswordWithId}
                      name="accessPassword"
                      defaultValue={store.access_password ?? ""}
                      hidden={{}}
                      className="h-8 w-32"
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/dashboard/master/stores/${store.id}`} />}
                    >
                      編集
                    </Button>
                    <form action={setStoreActive}>
                      <input type="hidden" name="id" value={store.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={String(!store.is_active)}
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        {store.is_active ? "無効化" : "有効化"}
                      </Button>
                    </form>
                    <form action={deleteStore}>
                      <input type="hidden" name="id" value={store.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`「${store.name}」を削除しますか？過去の患者・集客費データは残りますが、一覧には表示されなくなります。`}
                        variant="destructive"
                        size="sm"
                      >
                        削除
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
              );
            })}
            {!stores?.length && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  店舗がまだ登録されていません。先にエリアを登録してください。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

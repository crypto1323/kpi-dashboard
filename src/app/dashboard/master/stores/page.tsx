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
import { setStoreActive } from "./actions";

export default async function StoresPage() {
  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("*, areas(name)")
    .order("code");

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">店舗マスタ</h2>
        <Button size="sm" render={<Link href="/dashboard/master/stores/new" />}>
          + 新規店舗
        </Button>
      </div>
      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>店舗コード</TableHead>
              <TableHead>店舗名</TableHead>
              <TableHead>エリア</TableHead>
              <TableHead>状態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores?.map((store) => (
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
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!stores?.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
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

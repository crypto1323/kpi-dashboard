import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { adminGateOrNull } from "@/lib/admin-gate";
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
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteArea, setAreaActive } from "./actions";

export default async function AreasPage() {
  const gate = await adminGateOrNull("/dashboard/master/areas");
  if (gate) return gate;

  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("*")
    .eq("is_deleted", false)
    .order("name");

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">エリアマスタ</h2>
        <Button size="sm" render={<Link href="/dashboard/master/areas/new" />}>
          + 新規エリア
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>エリア名</TableHead>
              <TableHead>状態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas?.map((area) => (
              <TableRow key={area.id}>
                <TableCell className="font-medium">{area.name}</TableCell>
                <TableCell>
                  <Badge variant={area.is_active ? "secondary" : "outline"}>
                    {area.is_active ? "有効" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/dashboard/master/areas/${area.id}`} />}
                    >
                      編集
                    </Button>
                    <form action={setAreaActive}>
                      <input type="hidden" name="id" value={area.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={String(!area.is_active)}
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        {area.is_active ? "無効化" : "有効化"}
                      </Button>
                    </form>
                    <form action={deleteArea}>
                      <input type="hidden" name="id" value={area.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`「${area.name}」を削除しますか？このエリアに属する店舗の過去データは残りますが、一覧には表示されなくなります。`}
                        variant="destructive"
                        size="sm"
                      >
                        削除
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!areas?.length && (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center text-muted-foreground"
                >
                  エリアがまだ登録されていません。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

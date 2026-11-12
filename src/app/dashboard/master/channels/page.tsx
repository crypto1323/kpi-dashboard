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
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { adminGateOrNull } from "@/lib/admin-gate";
import { deleteChannel, setChannelActive } from "./actions";

export default async function ChannelsPage() {
  const gate = await adminGateOrNull("/dashboard/master/channels");
  if (gate) return gate;

  const supabase = await createClient();
  const { data: channels } = await supabase
    .from("channels")
    .select("*")
    .eq("is_deleted", false)
    .order("sort_order");

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-medium">流入媒体マスタ</h2>
        <Button size="sm" render={<Link href="/dashboard/master/channels/new" />}>
          + 新規媒体
        </Button>
      </div>
      <div className="rounded-xl border bg-card shadow-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>表示順</TableHead>
              <TableHead>媒体名</TableHead>
              <TableHead>分類</TableHead>
              <TableHead>状態</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels?.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell className="text-muted-foreground">
                  {channel.sort_order}
                </TableCell>
                <TableCell className="font-medium">{channel.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {channel.category ?? "—"}
                </TableCell>
                <TableCell>
                  <Badge variant={channel.is_active ? "secondary" : "outline"}>
                    {channel.is_active ? "有効" : "無効"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      render={<Link href={`/dashboard/master/channels/${channel.id}`} />}
                    >
                      編集
                    </Button>
                    <form action={setChannelActive}>
                      <input type="hidden" name="id" value={channel.id} />
                      <input
                        type="hidden"
                        name="isActive"
                        value={String(!channel.is_active)}
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        {channel.is_active ? "無効化" : "有効化"}
                      </Button>
                    </form>
                    <form action={deleteChannel}>
                      <input type="hidden" name="id" value={channel.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`「${channel.name}」を削除しますか？過去の患者・集客費データは残りますが、一覧には表示されなくなります。`}
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
            {!channels?.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  媒体がまだ登録されていません。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

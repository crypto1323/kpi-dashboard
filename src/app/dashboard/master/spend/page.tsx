import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StoreSwitcher } from "@/components/store-switcher";
import { upsertChannelSpend } from "./actions";

export default async function MasterSpendPage({
  searchParams,
}: PageProps<"/dashboard/master/spend">) {
  const { error, storeId: storeIdParam } = await searchParams;
  const errorMessage = Array.isArray(error) ? error[0] : error;

  const supabase = await createClient();
  const { data: stores } = await supabase
    .from("stores")
    .select("id, code, name")
    .eq("is_active", true)
    .order("code");

  const requested = Array.isArray(storeIdParam) ? storeIdParam[0] : storeIdParam;
  const storeId = requested ?? stores?.[0]?.id ?? null;

  if (!storeId) {
    return (
      <Card className="max-w-md">
        <CardContent className="text-sm text-muted-foreground">
          店舗がまだ登録されていません。先に店舗を登録してください。
        </CardContent>
      </Card>
    );
  }

  const [{ data: channels }, { data: spends }, { data: store }] =
    await Promise.all([
      supabase
        .from("channels")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("channel_spends")
        .select("channel_id, amount")
        .eq("store_id", storeId),
      supabase.from("stores").select("code, name").eq("id", storeId).single(),
    ]);

  const amountByChannel = new Map(
    (spends ?? []).map((spend) => [spend.channel_id, spend.amount]),
  );

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-medium">媒体費用</h2>
          <p className="text-sm text-muted-foreground">
            {store ? `${store.code} ${store.name}` : ""} ・
            年間契約額など、店舗×媒体の費用を随時編集できます（月次入力は不要です）。
          </p>
        </div>
        {stores && stores.length > 0 && (
          <StoreSwitcher stores={stores} value={storeId} />
        )}
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>流入媒体</TableHead>
              <TableHead className="text-right">費用（円）</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels?.map((channel) => (
              <TableRow key={channel.id}>
                <TableCell className="font-medium">{channel.name}</TableCell>
                <TableCell className="text-right">
                  <form
                    action={upsertChannelSpend.bind(null, storeId, channel.id)}
                    className="flex items-center justify-end gap-1.5"
                  >
                    <span>¥</span>
                    <Input
                      type="number"
                      name="amount"
                      min={0}
                      step={1000}
                      defaultValue={amountByChannel.get(channel.id) ?? 0}
                      className="w-28 text-right"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      保存
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
            {!channels?.length && (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
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

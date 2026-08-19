import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StoreSwitcher } from "@/components/store-switcher";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { deleteSpend, upsertSpend } from "./actions";

export default async function SpendPage({
  searchParams,
}: PageProps<"/dashboard/spend">) {
  const profile = await getCurrentProfile();
  const { error, storeId: storeIdParam } = await searchParams;

  if (profile.role === "area_manager") {
    return (
      <Card className="max-w-md">
        <CardContent className="text-sm text-muted-foreground">
          エリア長アカウントでは媒体費用の入力はできません。集客費の集計結果はレポート画面でご確認いただけます。
        </CardContent>
      </Card>
    );
  }

  const supabase = await createClient();

  let storeId: string | null = null;
  let activeStores: { id: string; code: string; name: string }[] = [];

  if (profile.role === "admin") {
    const { data } = await supabase
      .from("stores")
      .select("id, code, name")
      .eq("is_active", true)
      .order("code");
    activeStores = data ?? [];
    const requested = Array.isArray(storeIdParam) ? storeIdParam[0] : storeIdParam;
    storeId = requested ?? activeStores[0]?.id ?? null;
  } else {
    storeId = profile.store_id;
  }

  if (!storeId) {
    return (
      <Card className="max-w-md">
        <CardContent className="text-sm text-muted-foreground">
          {profile.role === "admin"
            ? "店舗がまだ登録されていません。先にマスタ管理から店舗を登録してください。"
            : "店舗が未設定です。管理者にお問い合わせください。"}
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
        .select("*, channels(name)")
        .eq("store_id", storeId)
        .order("period", { ascending: false }),
      supabase.from("stores").select("code, name").eq("id", storeId).single(),
    ]);

  const errorMessage = Array.isArray(error) ? error[0] : error;
  const currentMonth = new Date().toISOString().slice(0, 7);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">媒体費用の登録</h1>
          <p className="text-sm text-muted-foreground">
            {store ? `${store.code} ${store.name}` : ""} ・
            集客費（1人あたりの獲得コスト）の算出に使われます。
          </p>
        </div>
        {profile.role === "admin" && activeStores.length > 0 && (
          <StoreSwitcher stores={activeStores} value={storeId} />
        )}
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium">月次費用を登録・更新</h2>
          <form action={upsertSpend} className="flex flex-wrap items-end gap-3">
            {profile.role === "admin" && (
              <input type="hidden" name="storeId" value={storeId} />
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="channelId">流入媒体</Label>
              <Select name="channelId">
                <SelectTrigger id="channelId" className="w-48">
                  <SelectValue placeholder="媒体を選択" />
                </SelectTrigger>
                <SelectContent>
                  {channels?.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="period">対象月</Label>
              <Input
                id="period"
                name="period"
                type="month"
                defaultValue={currentMonth}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">金額（円）</Label>
              <Input
                id="amount"
                name="amount"
                type="number"
                min={0}
                step={1000}
                required
                className="w-32"
              />
            </div>
            <Button type="submit" disabled={!channels?.length}>
              登録
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            同じ月・同じ媒体で再登録すると金額が上書きされます。
          </p>
          {!channels?.length && (
            <p className="mt-2 text-sm text-muted-foreground">
              媒体が未登録です。マスタ管理から流入媒体を登録してください。
            </p>
          )}
          {errorMessage && (
            <p className="mt-2 text-sm text-destructive">{errorMessage}</p>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>対象月</TableHead>
              <TableHead>流入媒体</TableHead>
              <TableHead className="text-right">金額</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spends?.map((spend) => {
              const deleteSpendWithId = deleteSpend.bind(null, spend.id);
              return (
                <TableRow key={spend.id}>
                  <TableCell className="whitespace-nowrap">
                    {spend.period.slice(0, 7)}
                  </TableCell>
                  <TableCell>{spend.channels?.name ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    ¥{spend.amount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <form action={deleteSpendWithId} className="inline-flex">
                      <input type="hidden" name="storeId" value={storeId} />
                      <ConfirmSubmitButton
                        confirmMessage="この費用データを削除しますか？"
                        size="sm"
                        variant="destructive"
                      >
                        削除
                      </ConfirmSubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              );
            })}
            {!spends?.length && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-muted-foreground"
                >
                  まだ費用データがありません。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

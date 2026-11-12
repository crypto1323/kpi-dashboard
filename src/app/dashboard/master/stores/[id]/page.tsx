import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminGateOrNull } from "@/lib/admin-gate";
import { updateStore } from "../actions";

export default async function EditStorePage({
  params,
  searchParams,
}: PageProps<"/dashboard/master/stores/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;

  const gate = await adminGateOrNull(`/dashboard/master/stores/${id}`);
  if (gate) return gate;

  const supabase = await createClient();
  const [{ data: store }, { data: areas }] = await Promise.all([
    supabase.from("stores").select("*").eq("id", id).single(),
    supabase.from("areas").select("id, name").eq("is_deleted", false).order("name"),
  ]);

  if (!store || store.is_deleted) notFound();

  const updateStoreWithId = updateStore.bind(null, id);

  return (
    <div className="max-w-md pt-4">
      <h2 className="mb-4 text-base font-medium">店舗を編集</h2>
      <Card>
        <CardContent>
          <form action={updateStoreWithId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="areaId">エリア</Label>
              <Select
                name="areaId"
                defaultValue={store.area_id}
                items={Object.fromEntries((areas ?? []).map((area) => [area.id, area.name]))}
              >
                <SelectTrigger id="areaId" className="w-full">
                  <SelectValue placeholder="エリアを選択" />
                </SelectTrigger>
                <SelectContent>
                  {areas?.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">店舗コード</Label>
              <Input id="code" name="code" defaultValue={store.code} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">店舗名</Label>
              <Input id="name" name="name" defaultValue={store.name} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="openedAt">開業日（任意）</Label>
              <Input
                id="openedAt"
                name="openedAt"
                type="date"
                defaultValue={store.opened_at ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="accessPassword">店舗シート閲覧用パスワード（任意）</Label>
              <Input
                id="accessPassword"
                name="accessPassword"
                defaultValue={store.access_password ?? ""}
                placeholder="未設定（誰でも閲覧可）"
              />
              <p className="text-xs text-muted-foreground">
                設定すると、この店舗の店舗シートを開く前にパスワード入力が必要になります。空欄で保存するとロックを解除します。
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {Array.isArray(error) ? error[0] : error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit">保存</Button>
              <Button
                variant="outline"
                render={<Link href="/dashboard/master/stores" />}
              >
                キャンセル
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

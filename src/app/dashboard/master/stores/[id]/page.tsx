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
import { updateStore } from "../actions";

export default async function EditStorePage({
  params,
  searchParams,
}: PageProps<"/dashboard/master/stores/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: store }, { data: areas }] = await Promise.all([
    supabase.from("stores").select("*").eq("id", id).single(),
    supabase.from("areas").select("id, name").order("name"),
  ]);

  if (!store) notFound();

  const updateStoreWithId = updateStore.bind(null, id);

  return (
    <div className="max-w-md pt-4">
      <h2 className="mb-4 text-base font-medium">店舗を編集</h2>
      <Card>
        <CardContent>
          <form action={updateStoreWithId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="areaId">エリア</Label>
              <Select name="areaId" defaultValue={store.area_id}>
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

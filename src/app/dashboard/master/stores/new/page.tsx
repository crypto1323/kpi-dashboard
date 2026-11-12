import Link from "next/link";
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
import { createStore } from "../actions";

export default async function NewStorePage({
  searchParams,
}: PageProps<"/dashboard/master/stores/new">) {
  const gate = await adminGateOrNull("/dashboard/master/stores/new");
  if (gate) return gate;

  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: areas } = await supabase
    .from("areas")
    .select("id, name")
    .eq("is_deleted", false)
    .order("name");

  return (
    <div className="max-w-md pt-4">
      <h2 className="mb-4 text-base font-medium">新規店舗</h2>
      <Card>
        <CardContent>
          <form action={createStore} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="areaId">エリア</Label>
              <Select
                name="areaId"
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
              {!areas?.length && (
                <p className="text-sm text-muted-foreground">
                  先に
                  <Link href="/dashboard/master/areas/new" className="underline">
                    エリアを登録
                  </Link>
                  してください。
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="code">店舗コード</Label>
              <Input id="code" name="code" placeholder="例）KT-001" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">店舗名</Label>
              <Input id="name" name="name" placeholder="例）渋谷店" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="openedAt">開業日（任意）</Label>
              <Input id="openedAt" name="openedAt" type="date" />
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {Array.isArray(error) ? error[0] : error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit">作成</Button>
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

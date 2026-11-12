import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { adminGateOrNull } from "@/lib/admin-gate";
import { createChannel } from "../actions";

export default async function NewChannelPage({
  searchParams,
}: PageProps<"/dashboard/master/channels/new">) {
  const gate = await adminGateOrNull("/dashboard/master/channels/new");
  if (gate) return gate;

  const { error } = await searchParams;

  return (
    <div className="max-w-md pt-4">
      <h2 className="mb-4 text-base font-medium">新規媒体</h2>
      <Card>
        <CardContent>
          <form action={createChannel} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">媒体名</Label>
              <Input
                id="name"
                name="name"
                placeholder="例）ホットペッパー"
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">分類（任意）</Label>
              <Input id="category" name="category" placeholder="例）Web広告" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sortOrder">表示順</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                defaultValue={0}
              />
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
                render={<Link href="/dashboard/master/channels" />}
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

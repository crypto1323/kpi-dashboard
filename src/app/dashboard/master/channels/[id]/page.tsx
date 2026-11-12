import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { adminGateOrNull } from "@/lib/admin-gate";
import { updateChannel } from "../actions";

export default async function EditChannelPage({
  params,
  searchParams,
}: PageProps<"/dashboard/master/channels/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;

  const gate = await adminGateOrNull(`/dashboard/master/channels/${id}`);
  if (gate) return gate;

  const supabase = await createClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("*")
    .eq("id", id)
    .single();

  if (!channel || channel.is_deleted) notFound();

  const updateChannelWithId = updateChannel.bind(null, id);

  return (
    <div className="max-w-md pt-4">
      <h2 className="mb-4 text-base font-medium">媒体を編集</h2>
      <Card>
        <CardContent>
          <form action={updateChannelWithId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">媒体名</Label>
              <Input
                id="name"
                name="name"
                defaultValue={channel.name}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="category">分類（任意）</Label>
              <Input
                id="category"
                name="category"
                defaultValue={channel.category ?? ""}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sortOrder">表示順</Label>
              <Input
                id="sortOrder"
                name="sortOrder"
                type="number"
                defaultValue={channel.sort_order}
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

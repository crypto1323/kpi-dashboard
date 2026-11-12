import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminGateOrNull } from "@/lib/admin-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { updateArea } from "../actions";

export default async function EditAreaPage({
  params,
  searchParams,
}: PageProps<"/dashboard/master/areas/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;

  const gate = await adminGateOrNull(`/dashboard/master/areas/${id}`);
  if (gate) return gate;

  const supabase = await createClient();
  const { data: area } = await supabase
    .from("areas")
    .select("*")
    .eq("id", id)
    .single();

  if (!area || area.is_deleted) notFound();

  const updateAreaWithId = updateArea.bind(null, id);

  return (
    <div className="max-w-md pt-4">
      <h2 className="mb-4 text-base font-medium">エリアを編集</h2>
      <Card>
        <CardContent>
          <form action={updateAreaWithId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">エリア名</Label>
              <Input id="name" name="name" defaultValue={area.name} required autoFocus />
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {Array.isArray(error) ? error[0] : error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit">保存</Button>
              <Button variant="outline" render={<Link href="/dashboard/master/areas" />}>
                キャンセル
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { adminGateOrNull } from "@/lib/admin-gate";
import { createArea } from "../actions";

export default async function NewAreaPage({
  searchParams,
}: PageProps<"/dashboard/master/areas/new">) {
  const gate = await adminGateOrNull("/dashboard/master/areas/new");
  if (gate) return gate;

  const { error } = await searchParams;

  return (
    <div className="max-w-md pt-4">
      <h2 className="mb-4 text-base font-medium">新規エリア</h2>
      <Card>
        <CardContent>
          <form action={createArea} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">エリア名</Label>
              <Input id="name" name="name" required autoFocus />
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {Array.isArray(error) ? error[0] : error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit">作成</Button>
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

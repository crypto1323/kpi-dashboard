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
import { updateUserProfile } from "../actions";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "staff", label: "現場スタッフ" },
  { value: "area_manager", label: "エリア長" },
  { value: "admin", label: "本部・経営層" },
];

export default async function EditUserPage({
  params,
  searchParams,
}: PageProps<"/dashboard/master/users/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const [{ data: profile }, { data: emails }, { data: stores }, { data: areas }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", id).single(),
      supabase.rpc("list_user_emails"),
      supabase.from("stores").select("id, code, name").eq("is_active", true).order("code"),
      supabase.from("areas").select("id, name").eq("is_active", true).order("name"),
    ]);

  if (!profile) notFound();

  const email = ((emails ?? []) as { id: string; email: string | null }[]).find(
    (row) => row.id === id,
  )?.email;
  const updateUserProfileWithId = updateUserProfile.bind(null, id);

  return (
    <div className="max-w-md pt-4">
      <h2 className="mb-1 text-base font-medium">ユーザーを編集</h2>
      <p className="mb-4 text-sm text-muted-foreground">{email ?? profile.id}</p>
      <Card>
        <CardContent>
          <form action={updateUserProfileWithId} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">表示名</Label>
              <Input
                id="displayName"
                name="displayName"
                defaultValue={profile.display_name}
                required
                autoFocus
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="role">権限</Label>
              <Select name="role" defaultValue={profile.role}>
                <SelectTrigger id="role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="storeId">所属店舗（現場スタッフの場合）</Label>
              <Select name="storeId" defaultValue={profile.store_id ?? ""}>
                <SelectTrigger id="storeId" className="w-full">
                  <SelectValue placeholder="未設定" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">未設定</SelectItem>
                  {stores?.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.code} {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="areaId">所属エリア（エリア長の場合）</Label>
              <Select name="areaId" defaultValue={profile.area_id ?? ""}>
                <SelectTrigger id="areaId" className="w-full">
                  <SelectValue placeholder="未設定" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">未設定</SelectItem>
                  {areas?.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error && (
              <p className="text-sm text-destructive">
                {Array.isArray(error) ? error[0] : error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit">保存</Button>
              <Button variant="outline" render={<Link href="/dashboard/master/users" />}>
                キャンセル
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

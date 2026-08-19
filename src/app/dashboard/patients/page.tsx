import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { createPatient, updatePatient } from "./actions";

const CONTRACT_LABEL: Record<string, string> = {
  pending: "保留",
  contracted: "成約",
  declined: "不成約",
};

export default async function PatientsPage({
  searchParams,
}: PageProps<"/dashboard/patients">) {
  const profile = await getCurrentProfile();
  const { error, storeId: storeIdParam } = await searchParams;

  if (profile.role === "area_manager") {
    return (
      <Card className="max-w-md">
        <CardContent className="text-sm text-muted-foreground">
          エリア長アカウントでは初診患者の入力はできません。集計結果はエリア別ビュー（Phase
          4）でご確認いただけます。
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

  const [{ data: channels }, { data: patients }, { data: store }] =
    await Promise.all([
      supabase
        .from("channels")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("patients")
        .select("*, channels(name)")
        .eq("store_id", storeId)
        .order("visit_date", { ascending: false })
        .limit(50),
      supabase.from("stores").select("code, name").eq("id", storeId).single(),
    ]);

  const errorMessage = Array.isArray(error) ? error[0] : error;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">初診患者の記録</h1>
          <p className="text-sm text-muted-foreground">
            {store ? `${store.code} ${store.name}` : ""}
          </p>
        </div>
        {profile.role === "admin" && activeStores.length > 0 && (
          <StoreSwitcher stores={activeStores} value={storeId} />
        )}
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium">新規登録</h2>
          <form action={createPatient} className="flex flex-wrap items-end gap-3">
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
              <Label htmlFor="visitDate">初診日</Label>
              <Input
                id="visitDate"
                name="visitDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
            <Button type="submit" disabled={!channels?.length}>
              登録
            </Button>
          </form>
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
              <TableHead>初診日</TableHead>
              <TableHead>流入媒体</TableHead>
              <TableHead>2回目来院日</TableHead>
              <TableHead>成約状況</TableHead>
              <TableHead className="text-right">更新</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients?.map((patient) => {
              const updatePatientWithId = updatePatient.bind(null, patient.id);
              return (
                <TableRow key={patient.id}>
                  <TableCell className="whitespace-nowrap">
                    {patient.visit_date}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {patient.channels?.name ?? "—"}
                  </TableCell>
                  <TableCell colSpan={3}>
                    <form
                      action={updatePatientWithId}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <input type="hidden" name="storeId" value={storeId} />
                      <Input
                        type="date"
                        name="secondVisitDate"
                        defaultValue={patient.second_visit_date ?? ""}
                        className="w-40"
                      />
                      <Select
                        name="contractStatus"
                        defaultValue={patient.contract_status}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(CONTRACT_LABEL).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Badge
                        variant={
                          patient.contract_status === "contracted"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {CONTRACT_LABEL[patient.contract_status]}
                      </Badge>
                      <Button type="submit" size="sm" variant="outline">
                        更新
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              );
            })}
            {!patients?.length && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  この店舗の初診患者はまだ登録されていません。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        店舗別・エリア別・全社のグラフ集計は
        <Link href="/dashboard" className="underline">
          Phase 3以降
        </Link>
        で追加されます。
      </p>
    </div>
  );
}

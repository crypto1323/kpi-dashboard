import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
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
import { createPatient, deletePatient, updatePatient } from "./actions";
import type {
  ChannelPerformanceRow,
  GenderPerformanceRow,
  PatientGender,
  StaffChannelPerformanceRow,
  StaffGenderPerformanceRow,
  StaffPerformanceRow,
} from "@/lib/types";

const CONTRACT_LABEL: Record<string, string> = {
  pending: "保留",
  contracted: "成約",
  declined: "不成約",
};

const GENDER_LABEL: Record<PatientGender, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

type MetricRow = {
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
};

function AnalysisTable<T extends MetricRow>({
  rows,
  labelHeaders,
  getLabels,
  emptyMessage,
}: {
  rows: T[];
  labelHeaders: string[];
  getLabels: (row: T) => string[];
  emptyMessage: string;
}) {
  const total = rows.reduce(
    (acc, row) => ({
      patient_count: acc.patient_count + row.patient_count,
      second_visit_count: acc.second_visit_count + row.second_visit_count,
      contracted_count: acc.contracted_count + row.contracted_count,
    }),
    { patient_count: 0, second_visit_count: 0, contracted_count: 0 },
  );

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            {labelHeaders.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
            <TableHead className="text-right">集客数（初診数）</TableHead>
            <TableHead className="text-right">初診率</TableHead>
            <TableHead className="text-right">成約率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              {getLabels(row).map((label, labelIndex) => (
                <TableCell
                  key={labelIndex}
                  className={labelIndex === 0 ? "font-medium" : "text-muted-foreground"}
                >
                  {label}
                </TableCell>
              ))}
              <TableCell className="text-right tabular-nums">
                {row.patient_count}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(row.second_visit_count, row.patient_count)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatPercent(row.contracted_count, row.patient_count)}
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell
                colSpan={labelHeaders.length + 3}
                className="text-center text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {rows.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={labelHeaders.length} className="font-medium">
                合計
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {total.patient_count}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatPercent(total.second_visit_count, total.patient_count)}
              </TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatPercent(total.contracted_count, total.patient_count)}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

export default async function PatientsPage({
  searchParams,
}: PageProps<"/dashboard/patients">) {
  const profile = await getCurrentProfile();
  const { error, storeId: storeIdParam } = await searchParams;

  if (profile.role === "area_manager") {
    return (
      <Card className="max-w-md">
        <CardContent className="text-sm text-muted-foreground">
          エリア長アカウントでは店舗シートは使用できません。集計結果は
          <Link href="/dashboard/report" className="underline">
            エリア・全社シート
          </Link>
          でご確認いただけます。
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

  const [
    { data: channels },
    { data: patients },
    { data: store },
    { data: channelPerf },
    { data: staffPerf },
    { data: staffChannelPerf },
    { data: staffGenderPerf },
    { data: genderPerf },
  ] = await Promise.all([
    supabase
      .from("channels")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("patients")
      .select("*, channels(name), profiles(display_name)")
      .eq("store_id", storeId)
      .order("visit_date", { ascending: false })
      .limit(50),
    supabase.from("stores").select("code, name").eq("id", storeId).single(),
    supabase.from("channel_performance_by_store").select("*").eq("store_id", storeId),
    supabase.from("patient_performance_by_staff").select("*").eq("store_id", storeId),
    supabase
      .from("patient_performance_by_staff_channel")
      .select("*")
      .eq("store_id", storeId),
    supabase
      .from("patient_performance_by_staff_gender")
      .select("*")
      .eq("store_id", storeId),
    supabase.from("patient_performance_by_gender").select("*").eq("store_id", storeId),
  ]);

  const errorMessage = Array.isArray(error) ? error[0] : error;

  const channelRows = ((channelPerf ?? []) as ChannelPerformanceRow[])
    .filter((row) => row.patient_count > 0)
    .sort((a, b) => b.patient_count - a.patient_count);
  const staffRows = ((staffPerf ?? []) as StaffPerformanceRow[]).sort(
    (a, b) => b.patient_count - a.patient_count,
  );
  const staffChannelRows = ((staffChannelPerf ?? []) as StaffChannelPerformanceRow[]).sort(
    (a, b) => a.staff_name.localeCompare(b.staff_name) || b.patient_count - a.patient_count,
  );
  const staffGenderRows = ((staffGenderPerf ?? []) as StaffGenderPerformanceRow[]).sort(
    (a, b) => a.staff_name.localeCompare(b.staff_name),
  );
  const genderRows = ((genderPerf ?? []) as GenderPerformanceRow[]).sort(
    (a, b) => b.patient_count - a.patient_count,
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">店舗シート</h1>
          <p className="text-sm text-muted-foreground">
            {store ? `${store.code} ${store.name}` : ""}
          </p>
        </div>
        {profile.role === "admin" && activeStores.length > 0 && (
          <StoreSwitcher stores={activeStores} value={storeId} />
        )}
      </div>

      <Tabs defaultValue="entry">
        <TabsList>
          <TabsTrigger value="entry">登録</TabsTrigger>
          <TabsTrigger value="analysis">分析</TabsTrigger>
        </TabsList>

        <TabsContent value="entry" className="flex flex-col gap-6 pt-4">
          <Card>
            <CardContent>
              <h2 className="mb-3 text-sm font-medium">新規登録</h2>
              <form
                action={createPatient}
                className="flex flex-wrap items-end gap-3"
              >
                {profile.role === "admin" && (
                  <input type="hidden" name="storeId" value={storeId} />
                )}
                <div className="flex flex-col gap-2">
                  <Label htmlFor="patientName">患者名</Label>
                  <Input
                    id="patientName"
                    name="patientName"
                    required
                    className="w-36"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="gender">性別</Label>
                  <Select name="gender">
                    <SelectTrigger id="gender" className="w-28">
                      <SelectValue placeholder="選択" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(GENDER_LABEL) as [PatientGender, string][]).map(
                        ([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
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
                  <TableHead>患者名</TableHead>
                  <TableHead>性別</TableHead>
                  <TableHead>担当者</TableHead>
                  <TableHead>流入媒体</TableHead>
                  <TableHead>2回目来院</TableHead>
                  <TableHead>成約</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients?.map((patient) => {
                  const updatePatientWithId = updatePatient.bind(null, patient.id);
                  const deletePatientWithId = deletePatient.bind(null, patient.id);
                  const hasSecondVisit = Boolean(patient.second_visit_date);
                  const isContracted = patient.contract_status === "contracted";
                  return (
                    <TableRow key={patient.id}>
                      <TableCell className="whitespace-nowrap">
                        {patient.visit_date}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium">
                        {patient.patient_name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {GENDER_LABEL[patient.gender as PatientGender]}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {patient.profiles?.display_name ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {patient.channels?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={hasSecondVisit ? "secondary" : "outline"}>
                          {hasSecondVisit ? "あり" : "なし"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={isContracted ? "secondary" : "outline"}>
                          {isContracted ? "あり" : "なし"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <details className="text-right">
                          <summary className="cursor-pointer text-muted-foreground select-none">
                            編集
                          </summary>
                          <form
                            action={updatePatientWithId}
                            className="mt-2 flex flex-wrap items-center justify-end gap-2"
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
                            <Button type="submit" size="sm" variant="outline">
                              更新
                            </Button>
                            <ConfirmSubmitButton
                              formAction={deletePatientWithId}
                              confirmMessage={`「${patient.patient_name}」の記録を削除しますか？この操作は取り消せません。`}
                              size="sm"
                              variant="destructive"
                            >
                              削除
                            </ConfirmSubmitButton>
                          </form>
                        </details>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!patients?.length && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center text-muted-foreground"
                    >
                      この店舗の初診患者はまだ登録されていません。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="flex flex-col gap-6 pt-4">
          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              担当者別（初診率＝2回目来院した割合）
            </h2>
            <AnalysisTable
              rows={staffRows}
              labelHeaders={["担当者"]}
              getLabels={(row) => [row.staff_name]}
              emptyMessage="まだ実績がありません。"
            />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              担当者別 × 流入媒体別
            </h2>
            <AnalysisTable
              rows={staffChannelRows}
              labelHeaders={["担当者", "流入媒体"]}
              getLabels={(row) => [row.staff_name, row.channel_name]}
              emptyMessage="まだ実績がありません。"
            />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              担当者別 × 性別
            </h2>
            <AnalysisTable
              rows={staffGenderRows}
              labelHeaders={["担当者", "性別"]}
              getLabels={(row) => [row.staff_name, GENDER_LABEL[row.gender]]}
              emptyMessage="まだ実績がありません。"
            />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              店舗全体 × 流入媒体別（合計行が店舗全体の初診率・成約率）
            </h2>
            <AnalysisTable
              rows={channelRows}
              labelHeaders={["流入媒体"]}
              getLabels={(row) => [row.channel_name]}
              emptyMessage="まだ実績がありません。"
            />
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              店舗全体 × 性別
            </h2>
            <AnalysisTable
              rows={genderRows}
              labelHeaders={["性別"]}
              getLabels={(row) => [GENDER_LABEL[row.gender]]}
              emptyMessage="まだ実績がありません。"
            />
          </div>
        </TabsContent>
      </Tabs>

      {profile.role === "admin" && (
        <p className="text-xs text-muted-foreground">
          エリア・全社の集計や集客費は
          <Link href="/dashboard/report" className="underline">
            エリア・全社シート
          </Link>
          で確認できます。
        </p>
      )}
    </div>
  );
}

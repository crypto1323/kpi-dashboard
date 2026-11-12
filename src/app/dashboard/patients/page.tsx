import Link from "next/link";
import { cookies } from "next/headers";
import { ensureBackingSession } from "@/lib/backing-session";
import { storeUnlockCookieName, storeUnlockToken } from "@/lib/store-lock";
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
import { MonthSwitcher } from "@/components/month-switcher";
import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { InlineSelectField, InlineTextField } from "@/components/inline-field";
import { RateBarChart } from "@/components/charts/RateBarChart";
import { StaffCrossChart } from "@/components/charts/StaffCrossChart";
import { StatTile } from "@/components/charts/StatTile";
import { Meter } from "@/components/charts/Meter";
import {
  createPatient,
  deletePatient,
  toggleContractStatus,
  toggleSecondVisit,
  unlockStore,
  updatePatientAssignee,
  updatePatientChannel,
  updatePatientCloser,
  updatePatientGender,
  updatePatientName,
  updatePatientVisitDate,
} from "./actions";
import { currentMonth, monthStartDate, nextMonthStart, resolveMonthParam } from "@/lib/month";
import type {
  ChannelPerformanceRow,
  GenderPerformanceRow,
  PatientGender,
  StaffChannelPerformanceRow,
  StaffGenderPerformanceRow,
  StaffPerformanceRow,
} from "@/lib/types";

const GENDER_LABEL: Record<PatientGender, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${rate(numerator, denominator).toFixed(1)}%`;
}

type MetricRow = {
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
  /** 担当者別ビューのみ: 成約者として担当した数。成約率の分母。 */
  closing_count?: number;
};

/** 成約率の分母。担当者別は「成約者として担当した数」、それ以外は集客数。 */
function closingBase(row: MetricRow) {
  return row.closing_count ?? row.patient_count;
}

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
      closing_count: acc.closing_count + closingBase(row),
    }),
    { patient_count: 0, second_visit_count: 0, contracted_count: 0, closing_count: 0 },
  );
  const showClosingCount = rows.some((row) => row.closing_count !== undefined);
  const metricColumnCount = showClosingCount ? 4 : 3;

  return (
    <div className="rounded-xl border bg-card shadow-md">
      <Table>
        <TableHeader>
          <TableRow>
            {labelHeaders.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
            <TableHead className="text-right">集客数（初診数）</TableHead>
            <TableHead className="text-right">初診率</TableHead>
            {showClosingCount && <TableHead className="text-right">成約対応数</TableHead>}
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
              {showClosingCount && (
                <TableCell className="text-right tabular-nums">{closingBase(row)}</TableCell>
              )}
              <TableCell className="text-right tabular-nums">
                {formatPercent(row.contracted_count, closingBase(row))}
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow>
              <TableCell
                colSpan={labelHeaders.length + metricColumnCount}
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
              {showClosingCount && (
                <TableCell className="text-right tabular-nums font-medium">
                  {total.closing_count}
                </TableCell>
              )}
              <TableCell className="text-right tabular-nums font-medium">
                {formatPercent(total.contracted_count, total.closing_count)}
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
  const {
    error,
    storeId: storeIdParam,
    month: monthParam,
    lockError,
  } = await searchParams;
  const month = resolveMonthParam(monthParam);
  const monthStart = monthStartDate(month);
  const monthEnd = nextMonthStart(month);
  const oneYearBeforeMonthStart = `${Number(month.slice(0, 4)) - 1}${monthStart.slice(4)}`;

  const supabase = await ensureBackingSession();

  const { data: storesData } = await supabase
    .from("stores")
    .select("id, code, name")
    .eq("is_active", true)
    .order("code");
  const activeStores = storesData ?? [];
  const requested = Array.isArray(storeIdParam) ? storeIdParam[0] : storeIdParam;
  const storeId = requested ?? activeStores[0]?.id ?? null;

  if (!storeId) {
    return (
      <Card className="max-w-md">
        <CardContent className="text-sm text-muted-foreground">
          店舗がまだ登録されていません。先にマスタ管理から店舗を登録してください。
        </CardContent>
      </Card>
    );
  }

  // --- 要件3: 店舗ごとのアクセスパスワード。設定されていて、かつこのブラウザが
  //     まだ解錠済みでなければ、患者データを一切取得せずロック画面だけを返す。 ---
  const { data: lockCheckStore } = await supabase
    .from("stores")
    .select("access_password")
    .eq("id", storeId)
    .single();
  const requiredPassword = lockCheckStore?.access_password;
  if (requiredPassword) {
    const cookieStore = await cookies();
    const unlocked =
      cookieStore.get(storeUnlockCookieName(storeId))?.value ===
      storeUnlockToken(storeId, requiredPassword);
    if (!unlocked) {
      const lockErrorMessage = Array.isArray(lockError) ? lockError[0] : lockError;
      return (
        <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-12">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">店舗シート</h1>
            <div className="flex items-center gap-3">
              {activeStores.length > 0 && (
                <StoreSwitcher stores={activeStores} value={storeId} />
              )}
            </div>
          </div>
          <Card className="mx-auto w-full max-w-sm">
            <CardContent>
              <h2 className="mb-1 text-base font-medium">パスワードが必要です</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                この店舗のシートを開くにはパスワードを入力してください。
              </p>
              <form action={unlockStore} className="flex flex-col gap-3">
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="month" value={month} />
                <div className="flex flex-col gap-2">
                  <Label htmlFor="storePassword">パスワード</Label>
                  <Input id="storePassword" name="password" type="password" required autoFocus />
                </div>
                {lockErrorMessage && (
                  <p className="text-sm text-destructive">{lockErrorMessage}</p>
                )}
                <Button type="submit">開く</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      );
    }
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
    { data: recentStaff },
  ] = await Promise.all([
    supabase
      .from("channels")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("patients")
      .select("*, channels(name)")
      .eq("store_id", storeId)
      .gte("visit_date", monthStart)
      .lt("visit_date", monthEnd)
      .order("visit_date", { ascending: false }),
    supabase.from("stores").select("code, name").eq("id", storeId).single(),
    supabase
      .from("channel_performance_by_store")
      .select("*")
      .eq("store_id", storeId)
      .eq("month", monthStart),
    supabase
      .from("patient_performance_by_staff")
      .select("*")
      .eq("store_id", storeId)
      .eq("month", monthStart),
    supabase
      .from("patient_performance_by_staff_channel")
      .select("*")
      .eq("store_id", storeId)
      .eq("month", monthStart),
    supabase
      .from("patient_performance_by_staff_gender")
      .select("*")
      .eq("store_id", storeId)
      .eq("month", monthStart),
    supabase
      .from("patient_performance_by_gender")
      .select("*")
      .eq("store_id", storeId)
      .eq("month", monthStart),
    // 担当者・成約者の入力候補（この店舗で直近1年に登場した氏名）。
    supabase
      .from("patients")
      .select("assignee_name, closer_name")
      .eq("store_id", storeId)
      .gte("visit_date", oneYearBeforeMonthStart)
      .lt("visit_date", monthEnd),
  ]);

  const errorMessage = Array.isArray(error) ? error[0] : error;

  const channelRows = ((channelPerf ?? []) as ChannelPerformanceRow[])
    .filter((row) => row.patient_count > 0)
    .sort((a, b) => b.patient_count - a.patient_count);
  const staffRows = ((staffPerf ?? []) as StaffPerformanceRow[]).sort(
    (a, b) => b.patient_count - a.patient_count || b.closing_count - a.closing_count,
  );
  const staffNameOptions = Array.from(
    new Set(
      (recentStaff ?? [])
        .flatMap((row) => [row.assignee_name, row.closer_name])
        .filter((name): name is string => Boolean(name)),
    ),
  ).sort((a, b) => a.localeCompare(b, "ja"));
  const staffChannelRows = ((staffChannelPerf ?? []) as StaffChannelPerformanceRow[]).sort(
    (a, b) => a.staff_name.localeCompare(b.staff_name) || b.patient_count - a.patient_count,
  );
  const staffGenderRows = ((staffGenderPerf ?? []) as StaffGenderPerformanceRow[]).sort(
    (a, b) => a.staff_name.localeCompare(b.staff_name),
  );
  const genderRows = ((genderPerf ?? []) as GenderPerformanceRow[]).sort(
    (a, b) => b.patient_count - a.patient_count,
  );
  const storeTotal = channelRows.reduce(
    (acc, row) => ({
      patient_count: acc.patient_count + row.patient_count,
      second_visit_count: acc.second_visit_count + row.second_visit_count,
      contracted_count: acc.contracted_count + row.contracted_count,
    }),
    { patient_count: 0, second_visit_count: 0, contracted_count: 0 },
  );
  function toChartData<T extends MetricRow>(rows: T[], label: (row: T) => string) {
    return rows.map((row) => ({
      label: label(row),
      初診率: Number(rate(row.second_visit_count, row.patient_count).toFixed(1)),
      成約率: Number(rate(row.contracted_count, closingBase(row)).toFixed(1)),
    }));
  }
  const defaultVisitDate =
    month === currentMonth() ? new Date().toISOString().slice(0, 10) : monthStart;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">店舗シート</h1>
          <p className="text-sm text-muted-foreground">
            {store ? `${store.code} ${store.name}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeStores.length > 0 && (
            <StoreSwitcher stores={activeStores} value={storeId} />
          )}
          <MonthSwitcher value={month} />
        </div>
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
                <input type="hidden" name="storeId" value={storeId} />
                <input type="hidden" name="month" value={month} />
                <datalist id="staffNameOptions">
                  {staffNameOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
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
                  <Label htmlFor="assigneeName">担当者</Label>
                  <Input
                    id="assigneeName"
                    name="assigneeName"
                    required
                    list="staffNameOptions"
                    className="w-32"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="closerName">成約者</Label>
                  <Input
                    id="closerName"
                    name="closerName"
                    placeholder="担当者と同じ"
                    list="staffNameOptions"
                    className="w-32"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="gender">性別</Label>
                  <Select name="gender" items={GENDER_LABEL}>
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
                  <Select
                    name="channelId"
                    items={Object.fromEntries(
                      (channels ?? []).map((channel) => [channel.id, channel.name]),
                    )}
                  >
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
                    defaultValue={defaultVisitDate}
                    min={monthStart}
                    max={new Date(new Date(monthEnd).getTime() - 86400000)
                      .toISOString()
                      .slice(0, 10)}
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

          <div className="rounded-xl border bg-card shadow-md">
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
                  <TableHead>成約者</TableHead>
                  <TableHead className="text-right">削除</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients?.map((patient) => {
                  const deletePatientWithId = deletePatient.bind(null, patient.id);
                  const toggleSecondVisitWithId = toggleSecondVisit.bind(null, patient.id);
                  const toggleContractStatusWithId = toggleContractStatus.bind(null, patient.id);
                  const updateNameWithId = updatePatientName.bind(null, patient.id);
                  const updateAssigneeWithId = updatePatientAssignee.bind(null, patient.id);
                  const updateCloserWithId = updatePatientCloser.bind(null, patient.id);
                  const updateGenderWithId = updatePatientGender.bind(null, patient.id);
                  const updateChannelWithId = updatePatientChannel.bind(null, patient.id);
                  const updateVisitDateWithId = updatePatientVisitDate.bind(null, patient.id);
                  const hasSecondVisit = Boolean(patient.second_visit_date);
                  const isContracted = patient.contract_status === "contracted";
                  const hiddenFields = { storeId, month };
                  return (
                    <TableRow key={patient.id}>
                      <TableCell>
                        <InlineTextField
                          action={updateVisitDateWithId}
                          name="visitDate"
                          type="date"
                          defaultValue={patient.visit_date}
                          hidden={hiddenFields}
                          className="w-36"
                        />
                      </TableCell>
                      <TableCell>
                        <InlineTextField
                          action={updateNameWithId}
                          name="patientName"
                          defaultValue={patient.patient_name}
                          hidden={hiddenFields}
                          className="w-32 font-medium"
                        />
                      </TableCell>
                      <TableCell>
                        <InlineSelectField
                          action={updateGenderWithId}
                          name="gender"
                          defaultValue={patient.gender}
                          items={GENDER_LABEL}
                          hidden={hiddenFields}
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <InlineTextField
                          action={updateAssigneeWithId}
                          name="assigneeName"
                          defaultValue={patient.assignee_name}
                          hidden={hiddenFields}
                          list="staffNameOptions"
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell>
                        <InlineSelectField
                          action={updateChannelWithId}
                          name="channelId"
                          defaultValue={patient.channel_id}
                          items={Object.fromEntries(
                            (channels ?? []).map((channel) => [channel.id, channel.name]),
                          )}
                          hidden={hiddenFields}
                          className="w-32"
                        />
                      </TableCell>
                      <TableCell>
                        <form action={toggleSecondVisitWithId}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="month" value={month} />
                          <input
                            type="hidden"
                            name="nextValue"
                            value={hasSecondVisit ? "" : new Date().toISOString().slice(0, 10)}
                          />
                          <button
                            type="submit"
                            className="cursor-pointer appearance-none border-0 bg-transparent p-0"
                          >
                            <Badge variant={hasSecondVisit ? "secondary" : "outline"}>
                              {hasSecondVisit ? "来た" : "来てない"}
                            </Badge>
                          </button>
                        </form>
                      </TableCell>
                      <TableCell>
                        <form action={toggleContractStatusWithId}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="month" value={month} />
                          <input
                            type="hidden"
                            name="nextStatus"
                            value={isContracted ? "pending" : "contracted"}
                          />
                          <button
                            type="submit"
                            className="cursor-pointer appearance-none border-0 bg-transparent p-0"
                          >
                            <Badge variant={isContracted ? "secondary" : "outline"}>
                              {isContracted ? "した" : "してない"}
                            </Badge>
                          </button>
                        </form>
                      </TableCell>
                      <TableCell>
                        {/* 空欄＝担当者と同じ。プレースホルダーに実効的な成約者を表示する。 */}
                        <InlineTextField
                          action={updateCloserWithId}
                          name="closerName"
                          defaultValue={patient.closer_name}
                          placeholder={patient.assignee_name}
                          hidden={hiddenFields}
                          list="staffNameOptions"
                          className="w-28"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <form action={deletePatientWithId}>
                          <input type="hidden" name="storeId" value={storeId} />
                          <input type="hidden" name="month" value={month} />
                          <ConfirmSubmitButton
                            confirmMessage={`「${patient.patient_name}」の記録を削除しますか？この操作は取り消せません。`}
                            size="sm"
                            variant="destructive"
                          >
                            削除
                          </ConfirmSubmitButton>
                        </form>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!patients?.length && (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center text-muted-foreground"
                    >
                      {month}のこの店舗の初診患者はまだ登録されていません。
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="analysis" className="flex flex-col gap-8 pt-4">
          <Card>
            <CardContent>
              <h2 className="mb-3 text-sm font-medium">店舗全体サマリー</h2>
              <div className="mb-4 grid grid-cols-3 gap-3">
                <StatTile label="集客数（初診数）" value={`${storeTotal.patient_count}人`} />
                <StatTile
                  label="初診率"
                  value={formatPercent(storeTotal.second_visit_count, storeTotal.patient_count)}
                />
                <StatTile
                  label="成約率"
                  value={formatPercent(storeTotal.contracted_count, storeTotal.patient_count)}
                />
              </div>
              <div className="max-w-xs">
                <Meter
                  label="成約率"
                  value={rate(storeTotal.contracted_count, storeTotal.patient_count)}
                />
              </div>
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              担当者別（初診率＝担当者として対応した患者の2回目来院率／成約率＝成約者として対応した患者の成約率）
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <AnalysisTable
                rows={staffRows}
                labelHeaders={["担当者"]}
                getLabels={(row) => [row.staff_name]}
                emptyMessage="まだ実績がありません。"
              />
              <RateBarChart data={toChartData(staffRows, (row) => row.staff_name)} />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              担当者別 × 流入媒体別・性別（担当者を選んで比較）
            </h2>
            <StaffCrossChart
              staffChannelRows={staffChannelRows}
              staffGenderRows={staffGenderRows}
            />
            <details className="mt-4">
              <summary className="cursor-pointer text-xs text-muted-foreground select-none">
                全担当者ぶんの数値表を見る
              </summary>
              <div className="mt-3 flex flex-col gap-6">
                <AnalysisTable
                  rows={staffChannelRows}
                  labelHeaders={["担当者", "流入媒体"]}
                  getLabels={(row) => [row.staff_name, row.channel_name]}
                  emptyMessage="まだ実績がありません。"
                />
                <AnalysisTable
                  rows={staffGenderRows}
                  labelHeaders={["担当者", "性別"]}
                  getLabels={(row) => [row.staff_name, GENDER_LABEL[row.gender]]}
                  emptyMessage="まだ実績がありません。"
                />
              </div>
            </details>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              店舗全体 × 流入媒体別（合計行が店舗全体の初診率・成約率）
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <AnalysisTable
                rows={channelRows}
                labelHeaders={["流入媒体"]}
                getLabels={(row) => [row.channel_name]}
                emptyMessage="まだ実績がありません。"
              />
              <RateBarChart data={toChartData(channelRows, (row) => row.channel_name)} />
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">
              店舗全体 × 性別
            </h2>
            <div className="grid gap-6 lg:grid-cols-2">
              <AnalysisTable
                rows={genderRows}
                labelHeaders={["性別"]}
                getLabels={(row) => [GENDER_LABEL[row.gender]]}
                emptyMessage="まだ実績がありません。"
              />
              <RateBarChart
                data={toChartData(genderRows, (row) => GENDER_LABEL[row.gender])}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground">
        エリア・全社の集計や集客費は
        <Link href="/dashboard/report" className="underline">
          エリア・全社シート
        </Link>
        で確認できます。
      </p>
    </div>
  );
}

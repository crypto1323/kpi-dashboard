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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HqScopeSwitcher } from "@/components/hq-scope-switcher";
import { QueryParamSelect } from "@/components/query-param-select";
import { MonthSwitcher } from "@/components/month-switcher";
import { RateBarChart } from "@/components/charts/RateBarChart";
import { CpaBarChart } from "@/components/charts/CpaBarChart";
import { StatTile } from "@/components/charts/StatTile";
import { Meter } from "@/components/charts/Meter";
import { upsertChannelSpend } from "./actions";
import { monthStartDate, prevMonthOf, resolveMonthParam } from "@/lib/month";
import type {
  ChannelPerformanceRow,
  GenderRollupRow,
  PatientGender,
  StaffRollupRow,
} from "@/lib/types";

const GENDER_LABEL: Record<PatientGender, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

type MetricRow = {
  patient_count: number;
  second_visit_count: number;
  contracted_count: number;
};

function rate(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : (numerator / denominator) * 100;
}

function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${rate(numerator, denominator).toFixed(1)}%`;
}

function sumTotals(rows: MetricRow[]) {
  return rows.reduce(
    (acc, row) => ({
      patient_count: acc.patient_count + row.patient_count,
      second_visit_count: acc.second_visit_count + row.second_visit_count,
      contracted_count: acc.contracted_count + row.contracted_count,
    }),
    { patient_count: 0, second_visit_count: 0, contracted_count: 0 },
  );
}

function RollupTable<T extends MetricRow>({
  rows,
  labelHeader,
  getLabel,
}: {
  rows: T[];
  labelHeader: string;
  getLabel: (row: T) => string;
}) {
  const total = sumTotals(rows);
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{labelHeader}</TableHead>
            <TableHead className="text-right">集客数（初診数）</TableHead>
            <TableHead className="text-right">初診率</TableHead>
            <TableHead className="text-right">成約率</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{getLabel(row)}</TableCell>
              <TableCell className="text-right tabular-nums">{row.patient_count}</TableCell>
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
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                この月の実績はまだありません。
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {rows.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell className="font-medium">合計</TableCell>
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

function toChartData<T extends MetricRow>(rows: T[], label: (row: T) => string) {
  return rows.map((row) => ({
    label: label(row),
    初診率: Number(rate(row.second_visit_count, row.patient_count).toFixed(1)),
    成約率: Number(rate(row.contracted_count, row.patient_count).toFixed(1)),
  }));
}

export default async function HqDashboardPage({
  searchParams,
}: PageProps<"/hq-dashboard">) {
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const supabase = await createClient();

  const errorMessage = Array.isArray(params.error) ? params.error[0] : params.error;
  const month = resolveMonthParam(params.month);
  const monthStart = monthStartDate(month);

  let scope: string;
  let heading = "";
  let areaSwitcherProps: { areas: { id: string; name: string }[]; value: string } | null = null;

  if (profile.role === "area_manager") {
    if (!profile.area_id) {
      return (
        <Card className="max-w-md">
          <CardContent className="text-sm text-muted-foreground">
            エリアが未設定です。管理者にお問い合わせください。
          </CardContent>
        </Card>
      );
    }
    scope = profile.area_id;
    const { data: area } = await supabase.from("areas").select("name").eq("id", scope).single();
    heading = area?.name ?? "";
  } else {
    const { data: areas } = await supabase
      .from("areas")
      .select("id, name")
      .eq("is_active", true)
      .order("name");
    const requested = Array.isArray(params.scope) ? params.scope[0] : params.scope;
    const validArea = areas?.find((area) => area.id === requested);
    scope = requested === "company" || validArea ? requested! : "company";
    heading = scope === "company" ? "全社" : (validArea?.name ?? "全社");
    areaSwitcherProps = { areas: areas ?? [], value: scope };
  }

  const isCompany = scope === "company";

  const [
    { data: channelPerf },
    { data: staffPerf },
    { data: genderPerf },
    { data: scopeStores },
    { data: channels },
  ] = await Promise.all([
    (isCompany
      ? supabase.from("channel_performance_company").select("*")
      : supabase.from("channel_performance_by_area").select("*").eq("area_id", scope)
    ).eq("month", monthStart),
    (isCompany
      ? supabase.from("patient_performance_by_staff_company").select("*")
      : supabase.from("patient_performance_by_staff_area").select("*").eq("area_id", scope)
    ).eq("month", monthStart),
    (isCompany
      ? supabase.from("patient_performance_by_gender_company").select("*")
      : supabase.from("patient_performance_by_gender_area").select("*").eq("area_id", scope)
    ).eq("month", monthStart),
    isCompany
      ? supabase.from("stores").select("id, code, name").eq("is_active", true).order("code")
      : supabase
          .from("stores")
          .select("id, code, name")
          .eq("is_active", true)
          .eq("area_id", scope)
          .order("code"),
    supabase.from("channels").select("id, name").eq("is_active", true).order("sort_order"),
  ]);

  const channelRows = ((channelPerf ?? []) as ChannelPerformanceRow[]).sort(
    (a, b) => b.patient_count - a.patient_count,
  );
  const staffRows = ((staffPerf ?? []) as StaffRollupRow[]).sort(
    (a, b) => b.patient_count - a.patient_count,
  );
  const genderRows = ((genderPerf ?? []) as GenderRollupRow[]).sort(
    (a, b) => b.patient_count - a.patient_count,
  );
  const storeTotal = sumTotals(channelRows);

  // --- 集客費・CPA（選択した月・スコープ）。channel_performance_by_* が
  //     すでに月×媒体で spend_amount / patient_count を持っているので、
  //     ここから直接CPAを算出できる（別クエリ不要）。 ---
  const cpaRows = channelRows
    .map((row) => ({
      channelId: row.channel_id,
      channelName: row.channel_name,
      amount: row.spend_amount,
      visits: row.patient_count,
      cpa: row.patient_count === 0 ? null : Math.round(row.spend_amount / row.patient_count),
    }))
    .sort((a, b) => b.amount - a.amount);
  const cpaChartData = cpaRows
    .filter((row): row is typeof row & { cpa: number } => row.cpa !== null)
    .map((row) => ({ label: row.channelName, cpa: row.cpa }));

  // --- 集客費の入力（店舗を選び、前月の金額を初期値として引き継ぐ） ---
  const requestedSpendStore = Array.isArray(params.spendStoreId)
    ? params.spendStoreId[0]
    : params.spendStoreId;
  const spendStoreId =
    (scopeStores?.some((store) => store.id === requestedSpendStore) ? requestedSpendStore : null) ??
    scopeStores?.[0]?.id ??
    null;

  let spendRows: {
    channelId: string;
    channelName: string;
    amount: number;
    isCarriedOver: boolean;
  }[] = [];

  if (profile.role === "admin" && spendStoreId) {
    const prevMonth = prevMonthOf(month);
    const [{ data: thisMonthSpends }, { data: lastMonthSpends }] = await Promise.all([
      supabase
        .from("channel_spends")
        .select("channel_id, amount")
        .eq("store_id", spendStoreId)
        .eq("period", monthStart),
      supabase
        .from("channel_spends")
        .select("channel_id, amount")
        .eq("store_id", spendStoreId)
        .eq("period", monthStartDate(prevMonth)),
    ]);

    const thisMonthMap = new Map((thisMonthSpends ?? []).map((row) => [row.channel_id, row.amount]));
    const lastMonthMap = new Map((lastMonthSpends ?? []).map((row) => [row.channel_id, row.amount]));

    spendRows = (channels ?? []).map((channel) => {
      const savedThisMonth = thisMonthMap.get(channel.id);
      const carried = lastMonthMap.get(channel.id);
      return {
        channelId: channel.id,
        channelName: channel.name,
        amount: savedThisMonth ?? carried ?? 0,
        isCarriedOver: savedThisMonth === undefined && carried !== undefined,
      };
    });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-16">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">統合ダッシュボード</h1>
          <p className="text-sm text-muted-foreground">{heading}</p>
        </div>
        <div className="flex items-center gap-3">
          {areaSwitcherProps && <HqScopeSwitcher {...areaSwitcherProps} />}
          <MonthSwitcher value={month} />
        </div>
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium">サマリー（{month}）</h2>
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
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">担当者別</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <RollupTable rows={staffRows} labelHeader="担当者" getLabel={(row) => row.staff_name} />
          <RateBarChart data={toChartData(staffRows, (row) => row.staff_name)} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">流入媒体別</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <RollupTable
            rows={channelRows}
            labelHeader="流入媒体"
            getLabel={(row) => row.channel_name}
          />
          <RateBarChart data={toChartData(channelRows, (row) => row.channel_name)} />
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">性別</h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <RollupTable
            rows={genderRows}
            labelHeader="性別"
            getLabel={(row) => GENDER_LABEL[row.gender]}
          />
          <RateBarChart data={toChartData(genderRows, (row) => GENDER_LABEL[row.gender])} />
        </div>
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-4 text-sm font-medium">集客費・CPA分析（{month}）</h2>

          {profile.role === "admin" && spendStoreId && (
            <div className="mb-5 border-b pb-5">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <Label>集客費を入力する店舗</Label>
                <QueryParamSelect
                  paramName="spendStoreId"
                  value={spendStoreId}
                  items={Object.fromEntries(
                    (scopeStores ?? []).map((store) => [store.id, `${store.code} ${store.name}`]),
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  未入力の媒体には前月の金額を自動で表示します。そのまま保存すれば前月と同額、書き換えれば新しい金額で保存されます。
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {spendRows.map((row) => (
                  <form
                    key={row.channelId}
                    action={upsertChannelSpend}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="scope" value={scope} />
                    <input type="hidden" name="period" value={month} />
                    <input type="hidden" name="storeId" value={spendStoreId} />
                    <input type="hidden" name="channelId" value={row.channelId} />
                    <span className="w-28 text-sm font-medium">{row.channelName}</span>
                    <span>¥</span>
                    <Input
                      type="number"
                      name="amount"
                      min={0}
                      step={1000}
                      defaultValue={row.amount}
                      className="w-32"
                    />
                    {row.isCarriedOver && <Badge variant="outline">前月から引継ぎ</Badge>}
                    <Button type="submit" size="sm" variant="outline">
                      保存
                    </Button>
                  </form>
                ))}
                {!spendRows.length && (
                  <p className="text-sm text-muted-foreground">媒体が未登録です。</p>
                )}
              </div>
            </div>
          )}
          {!scopeStores?.length && (
            <p className="mb-4 text-sm text-muted-foreground">
              このスコープに店舗がありません。
            </p>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>流入媒体</TableHead>
                    <TableHead className="text-right">集客費</TableHead>
                    <TableHead className="text-right">来店数</TableHead>
                    <TableHead className="text-right">CPA（1人あたり）</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cpaRows.map((row) => (
                    <TableRow key={row.channelId}>
                      <TableCell className="font-medium">{row.channelName}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        ¥{row.amount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.visits}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.cpa === null ? "—" : `¥${row.cpa.toLocaleString()}`}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!cpaRows.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        この月のデータがまだありません。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {cpaChartData.length > 0 ? (
              <CpaBarChart data={cpaChartData} />
            ) : (
              <p className="flex items-center justify-center text-sm text-muted-foreground">
                この月はまだ来店データがありません。
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

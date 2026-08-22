import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
import { Card, CardContent } from "@/components/ui/card";
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
import { MonthRangeSwitcher } from "@/components/month-range-switcher";
import { InlineTextField } from "@/components/inline-field";
import { RateBarChart } from "@/components/charts/RateBarChart";
import { CpaBarChart } from "@/components/charts/CpaBarChart";
import { StatTile } from "@/components/charts/StatTile";
import { Meter } from "@/components/charts/Meter";
import { upsertChannelSpend } from "./actions";
import { monthStartDate, prevMonthOf, resolveMonthRangeParams } from "@/lib/month";
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
                この期間の実績はまだありません。
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

// The performance views carry one row per month; a period range returns one row
// per (entity, month) pair, so these collapse that down to one row per entity
// with every metric — including 集客費 — summed across the selected months.
function aggregateChannelRows(rows: ChannelPerformanceRow[]): ChannelPerformanceRow[] {
  const byChannel = new Map<string, ChannelPerformanceRow>();
  for (const row of rows) {
    const existing = byChannel.get(row.channel_id);
    if (existing) {
      existing.patient_count += row.patient_count;
      existing.second_visit_count += row.second_visit_count;
      existing.contracted_count += row.contracted_count;
      existing.spend_amount += row.spend_amount;
    } else {
      byChannel.set(row.channel_id, { ...row });
    }
  }
  return Array.from(byChannel.values());
}

function aggregateStaffRows(rows: StaffRollupRow[]): StaffRollupRow[] {
  const byStaff = new Map<string, StaffRollupRow>();
  for (const row of rows) {
    const existing = byStaff.get(row.staff_name);
    if (existing) {
      existing.patient_count += row.patient_count;
      existing.second_visit_count += row.second_visit_count;
      existing.contracted_count += row.contracted_count;
    } else {
      byStaff.set(row.staff_name, { ...row });
    }
  }
  return Array.from(byStaff.values());
}

function aggregateGenderRows(rows: GenderRollupRow[]): GenderRollupRow[] {
  const byGender = new Map<string, GenderRollupRow>();
  for (const row of rows) {
    const existing = byGender.get(row.gender);
    if (existing) {
      existing.patient_count += row.patient_count;
      existing.second_visit_count += row.second_visit_count;
      existing.contracted_count += row.contracted_count;
    } else {
      byGender.set(row.gender, { ...row });
    }
  }
  return Array.from(byGender.values());
}

export default async function HqDashboardPage({
  searchParams,
}: PageProps<"/hq-dashboard">) {
  const profile = await getCurrentProfile();
  const params = await searchParams;
  const supabase = await createClient();

  const errorMessage = Array.isArray(params.error) ? params.error[0] : params.error;
  const { from, to } = resolveMonthRangeParams(params.from, params.to);
  const fromStart = monthStartDate(from);
  const toStart = monthStartDate(to);
  const periodLabel = from === to ? from : `${from} 〜 ${to}`;
  // 集客費の入力（マス目編集）は範囲の終端月に対して行う — 合算値のセルは編集できないため。
  const editMonth = to;
  const editMonthStart = toStart;

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
    )
      .gte("month", fromStart)
      .lte("month", toStart),
    (isCompany
      ? supabase.from("patient_performance_by_staff_company").select("*")
      : supabase.from("patient_performance_by_staff_area").select("*").eq("area_id", scope)
    )
      .gte("month", fromStart)
      .lte("month", toStart),
    (isCompany
      ? supabase.from("patient_performance_by_gender_company").select("*")
      : supabase.from("patient_performance_by_gender_area").select("*").eq("area_id", scope)
    )
      .gte("month", fromStart)
      .lte("month", toStart),
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

  const channelRows = aggregateChannelRows(
    (channelPerf ?? []) as ChannelPerformanceRow[],
  ).sort((a, b) => b.patient_count - a.patient_count);
  const staffRows = aggregateStaffRows((staffPerf ?? []) as StaffRollupRow[]).sort(
    (a, b) => b.patient_count - a.patient_count,
  );
  const genderRows = aggregateGenderRows((genderPerf ?? []) as GenderRollupRow[]).sort(
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

  // --- 集客費マトリクス（媒体×店舗、前月の金額を初期値として引き継ぐ） ---
  const spendStoreIds = (scopeStores ?? []).map((store) => store.id);

  type SpendCellData = { amount: number; isCarriedOver: boolean };
  const spendMatrix = new Map<string, Map<string, SpendCellData>>();

  if (profile.role === "admin" && spendStoreIds.length) {
    const prevMonth = prevMonthOf(editMonth);
    const [{ data: thisMonthSpends }, { data: lastMonthSpends }] = await Promise.all([
      supabase
        .from("channel_spends")
        .select("store_id, channel_id, amount")
        .in("store_id", spendStoreIds)
        .eq("period", editMonthStart),
      supabase
        .from("channel_spends")
        .select("store_id, channel_id, amount")
        .in("store_id", spendStoreIds)
        .eq("period", monthStartDate(prevMonth)),
    ]);

    const thisMonthMap = new Map(
      (thisMonthSpends ?? []).map((row) => [`${row.store_id}:${row.channel_id}`, row.amount]),
    );
    const lastMonthMap = new Map(
      (lastMonthSpends ?? []).map((row) => [`${row.store_id}:${row.channel_id}`, row.amount]),
    );

    for (const store of scopeStores ?? []) {
      const channelMap = new Map<string, SpendCellData>();
      for (const channel of channels ?? []) {
        const key = `${store.id}:${channel.id}`;
        const savedThisMonth = thisMonthMap.get(key);
        const carried = lastMonthMap.get(key);
        channelMap.set(channel.id, {
          amount: savedThisMonth ?? carried ?? 0,
          isCarriedOver: savedThisMonth === undefined && carried !== undefined,
        });
      }
      spendMatrix.set(store.id, channelMap);
    }
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
          <MonthRangeSwitcher from={from} to={to} />
        </div>
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}

      <Card>
        <CardContent>
          <h2 className="mb-3 text-sm font-medium">サマリー（{periodLabel}）</h2>
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
          担当者別（上位10名）
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <RollupTable
            rows={staffRows.slice(0, 10)}
            labelHeader="担当者"
            getLabel={(row) => row.staff_name}
          />
          <RateBarChart data={toChartData(staffRows.slice(0, 10), (row) => row.staff_name)} />
        </div>
        {staffRows.length > 10 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-muted-foreground select-none">
              11位以降（{staffRows.length - 10}名）を見る
            </summary>
            <div className="mt-3">
              <RollupTable
                rows={staffRows.slice(10)}
                labelHeader="担当者"
                getLabel={(row) => row.staff_name}
              />
            </div>
          </details>
        )}
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
          <h2 className="mb-1 text-sm font-medium">集客費・CPA分析（{periodLabel}）</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            集客費は期間内の合計、CPAは期間合計の集客費 ÷ 期間合計の来店数です。
          </p>

          {profile.role === "admin" && scopeStores && scopeStores.length > 0 && (
            <div className="mb-5 border-b pb-5">
              <p className="mb-3 text-xs text-muted-foreground">
                集客費の入力は{editMonth}分を編集しています（複数月の合算値は入力できないため、期間の終端月を編集します）。未入力のマスは前月の金額を薄い枠で表示します（そのままクリック外せば前月と同額で保存、書き換えれば新しい金額で保存）。横にスクロールすると全店舗、媒体名は常に左端に固定されます。
              </p>
              <div className="max-h-[60vh] overflow-auto rounded-lg border">
                <table className="border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 left-0 z-20 min-w-32 border-b border-r bg-muted px-3 py-2 text-left font-medium whitespace-nowrap">
                        流入媒体
                      </th>
                      {scopeStores.map((store) => (
                        <th
                          key={store.id}
                          className="sticky top-0 z-10 min-w-32 border-b bg-muted px-3 py-2 text-left font-medium whitespace-nowrap"
                        >
                          {store.code} {store.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(channels ?? []).map((channel) => (
                      <tr key={channel.id}>
                        <td className="sticky left-0 z-10 border-r bg-background px-3 py-1.5 font-medium whitespace-nowrap">
                          {channel.name}
                        </td>
                        {scopeStores.map((store) => {
                          const cell = spendMatrix.get(store.id)?.get(channel.id);
                          return (
                            <td key={store.id} className="border-t px-2 py-1.5">
                              <InlineTextField
                                action={upsertChannelSpend}
                                name="amount"
                                type="number"
                                min={0}
                                step={1000}
                                defaultValue={cell?.amount ?? 0}
                                hidden={{
                                  scope,
                                  period: editMonth,
                                  from,
                                  to,
                                  storeId: store.id,
                                  channelId: channel.id,
                                }}
                                className={`h-8 w-24 text-right ${
                                  cell?.isCarriedOver
                                    ? "border-dashed text-muted-foreground"
                                    : ""
                                }`}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {!channels?.length && (
                      <tr>
                        <td className="px-3 py-4 text-center text-muted-foreground">
                          媒体が未登録です。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
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
                        この期間のデータがまだありません。
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
                この期間はまだ来店データがありません。
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

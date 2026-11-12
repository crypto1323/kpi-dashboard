import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
import { isAdminSectionUnlocked } from "@/lib/admin-gate";
import { AdminPasswordGate } from "@/components/admin-password-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AreaSwitcher } from "@/components/area-switcher";
import { MonthRangeSwitcher } from "@/components/month-range-switcher";
import { monthStartDate, resolveMonthRangeParams } from "@/lib/month";
import { aggregateChannelRows } from "@/lib/aggregate";
import type { ChannelPerformanceRow } from "@/lib/types";

function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatCpa(spend: number, patients: number) {
  if (patients === 0) return "—";
  return `¥${Math.round(spend / patients).toLocaleString()}`;
}

/** Shared 流入媒体 breakdown table — used for both the overall total and each
 * individual store, so the two always show exactly the same columns. */
function ChannelBreakdownTable({ rows }: { rows: ChannelPerformanceRow[] }) {
  const sorted = [...rows].sort((a, b) => b.patient_count - a.patient_count);
  const totals = sorted.reduce(
    (acc, row) => ({
      patient_count: acc.patient_count + row.patient_count,
      second_visit_count: acc.second_visit_count + row.second_visit_count,
      contracted_count: acc.contracted_count + row.contracted_count,
      spend_amount: acc.spend_amount + row.spend_amount,
    }),
    { patient_count: 0, second_visit_count: 0, contracted_count: 0, spend_amount: 0 },
  );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>流入媒体</TableHead>
          <TableHead className="text-right">集客数（初診数）</TableHead>
          <TableHead className="text-right">初診率</TableHead>
          <TableHead className="text-right">成約率</TableHead>
          <TableHead className="text-right">媒体費用</TableHead>
          <TableHead className="text-right">集客費（1人あたり）</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row) => (
          <TableRow key={row.channel_id}>
            <TableCell className="font-medium">{row.channel_name}</TableCell>
            <TableCell className="text-right tabular-nums">{row.patient_count}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(row.second_visit_count, row.patient_count)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(row.contracted_count, row.patient_count)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              ¥{row.spend_amount.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCpa(row.spend_amount, row.patient_count)}
            </TableCell>
          </TableRow>
        ))}
        {!sorted.length && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground">
              この期間の集計対象データはまだありません。
            </TableCell>
          </TableRow>
        )}
      </TableBody>
      {sorted.length > 0 && (
        <TableFooter>
          <TableRow>
            <TableCell className="font-medium">総合計</TableCell>
            <TableCell className="text-right tabular-nums font-medium">
              {totals.patient_count}
            </TableCell>
            <TableCell className="text-right tabular-nums font-medium">
              {formatPercent(totals.second_visit_count, totals.patient_count)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold text-primary">
              {formatPercent(totals.contracted_count, totals.patient_count)}
            </TableCell>
            <TableCell className="text-right tabular-nums font-medium">
              ¥{totals.spend_amount.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums font-semibold text-primary">
              {formatCpa(totals.spend_amount, totals.patient_count)}
            </TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

export default async function ReportPage({
  searchParams,
}: PageProps<"/dashboard/report">) {
  const unlocked = await isAdminSectionUnlocked();
  if (!unlocked) {
    return <AdminPasswordGate redirectTo="/dashboard/report" />;
  }
  const profile = await getCurrentProfile();

  const params = await searchParams;
  const supabase = await createClient();
  const { from, to } = resolveMonthRangeParams(params.from, params.to);
  const fromStart = monthStartDate(from);
  const toStart = monthStartDate(to);
  const periodLabel = from === to ? from : `${from} 〜 ${to}`;

  let level: "area" | "company";
  let heading = "";
  let rows: ChannelPerformanceRow[] = [];
  let areaSwitcherProps: { areas: { id: string; name: string }[]; value: string } | null = null;
  let scopeStores: { id: string; code: string; name: string }[] = [];

  if (profile.role === "area_manager") {
    level = "area";
    if (!profile.area_id) {
      return (
        <Card className="max-w-md">
          <CardContent className="text-sm text-muted-foreground">
            エリアが未設定です。管理者にお問い合わせください。
          </CardContent>
        </Card>
      );
    }
    const [{ data: area }, { data }, { data: stores }] = await Promise.all([
      supabase.from("areas").select("name").eq("id", profile.area_id).single(),
      supabase
        .from("channel_performance_by_area")
        .select("*")
        .eq("area_id", profile.area_id)
        .gte("month", fromStart)
        .lte("month", toStart),
      supabase
        .from("stores")
        .select("id, code, name")
        .eq("area_id", profile.area_id)
        .eq("is_active", true)
        .order("code"),
    ]);
    heading = area ? area.name : "エリア別レポート";
    rows = aggregateChannelRows((data ?? []) as ChannelPerformanceRow[]);
    scopeStores = stores ?? [];
  } else {
    // admin
    const requestedLevel = Array.isArray(params.level) ? params.level[0] : params.level;
    level = requestedLevel === "area" ? "area" : "company";

    if (level === "area") {
      const { data: areas } = await supabase
        .from("areas")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      const requestedArea = Array.isArray(params.areaId) ? params.areaId[0] : params.areaId;
      const areaId = requestedArea ?? areas?.[0]?.id ?? null;
      if (areaId) {
        const [{ data: area }, { data }, { data: stores }] = await Promise.all([
          supabase.from("areas").select("name").eq("id", areaId).single(),
          supabase
            .from("channel_performance_by_area")
            .select("*")
            .eq("area_id", areaId)
            .gte("month", fromStart)
            .lte("month", toStart),
          supabase
            .from("stores")
            .select("id, code, name")
            .eq("area_id", areaId)
            .eq("is_active", true)
            .order("code"),
        ]);
        heading = area ? area.name : "";
        rows = aggregateChannelRows((data ?? []) as ChannelPerformanceRow[]);
        areaSwitcherProps = { areas: areas ?? [], value: areaId };
        scopeStores = stores ?? [];
      }
    } else {
      heading = "全社";
      const [{ data }, { data: stores }] = await Promise.all([
        supabase
          .from("channel_performance_company")
          .select("*")
          .gte("month", fromStart)
          .lte("month", toStart),
        supabase.from("stores").select("id, code, name").eq("is_active", true).order("code"),
      ]);
      rows = aggregateChannelRows((data ?? []) as ChannelPerformanceRow[]);
      scopeStores = stores ?? [];
    }
  }

  // --- 要件1・3: 店舗ごとの内訳。channel_performance_by_store は店舗×媒体×月の
  //     生データなので、対象期間でそのまま絞り込めば店舗単位の媒体費用・集客数・
  //     CPAが正確に紐づく。店舗ごとに集約してから店舗IDでグルーピングする。 ---
  const storeIds = scopeStores.map((store) => store.id);
  const { data: byStoreData } = storeIds.length
    ? await supabase
        .from("channel_performance_by_store")
        .select("*")
        .in("store_id", storeIds)
        .gte("month", fromStart)
        .lte("month", toStart)
    : { data: [] as ChannelPerformanceRow[] };

  const rowsByStore = new Map<string, ChannelPerformanceRow[]>();
  for (const row of (byStoreData ?? []) as ChannelPerformanceRow[]) {
    if (!row.store_id) continue;
    const list = rowsByStore.get(row.store_id) ?? [];
    list.push(row);
    rowsByStore.set(row.store_id, list);
  }
  const storeChannelRows = new Map(
    scopeStores.map((store) => [
      store.id,
      aggregateChannelRows(rowsByStore.get(store.id) ?? []),
    ]),
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">エリア・全社シート</h1>
          <p className="text-sm text-muted-foreground">
            {heading}（{periodLabel}）
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profile.role === "admin" && (
            <div className="flex gap-1 rounded-xl border bg-card shadow-md p-1">
              <Button
                size="sm"
                variant={level === "area" ? "secondary" : "ghost"}
                render={<Link href="/dashboard/report?level=area" />}
              >
                エリア別
              </Button>
              <Button
                size="sm"
                variant={level === "company" ? "secondary" : "ghost"}
                render={<Link href="/dashboard/report?level=company" />}
              >
                全社
              </Button>
            </div>
          )}
          {areaSwitcherProps && <AreaSwitcher {...areaSwitcherProps} />}
          <MonthRangeSwitcher from={from} to={to} />
          {profile.role === "admin" && (
            <Button
              size="sm"
              variant="outline"
              render={<Link href="/hq-dashboard" />}
            >
              本部ダッシュボードで集客費を編集
            </Button>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          全体集計（{heading}）
        </h2>
        <div className="rounded-xl border-2 border-primary/40 bg-card shadow-lg">
          <ChannelBreakdownTable rows={rows} />
        </div>
      </div>

      {scopeStores.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">
            店舗別（{scopeStores.length}店舗）
          </h2>
          <div className="flex flex-col gap-6">
            {scopeStores.map((store) => (
              <Card key={store.id} className="border border-gray-200 bg-white shadow-sm">
                <CardContent>
                  <h3 className="mb-3 text-lg font-bold text-gray-800">
                    {store.code} {store.name}
                  </h3>
                  <div className="rounded-lg border">
                    <ChannelBreakdownTable rows={storeChannelRows.get(store.id) ?? []} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

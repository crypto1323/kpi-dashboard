import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";
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
import type { ChannelPerformanceRow } from "@/lib/types";

function formatPercent(numerator: number, denominator: number) {
  if (denominator === 0) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function formatCpa(spend: number, patients: number) {
  if (patients === 0) return "—";
  return `¥${Math.round(spend / patients).toLocaleString()}`;
}

export default async function ReportPage({
  searchParams,
}: PageProps<"/dashboard/report">) {
  const profile = await getCurrentProfile();
  if (profile.role === "staff") {
    redirect("/dashboard/patients");
  }

  const params = await searchParams;
  const supabase = await createClient();

  let level: "area" | "company";
  let heading = "";
  let rows: ChannelPerformanceRow[] = [];
  let areaSwitcherProps: { areas: { id: string; name: string }[]; value: string } | null = null;

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
    const [{ data: area }, { data }] = await Promise.all([
      supabase.from("areas").select("name").eq("id", profile.area_id).single(),
      supabase
        .from("channel_performance_by_area")
        .select("*")
        .eq("area_id", profile.area_id),
    ]);
    heading = area ? area.name : "エリア別レポート";
    rows = data ?? [];
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
        const [{ data: area }, { data }] = await Promise.all([
          supabase.from("areas").select("name").eq("id", areaId).single(),
          supabase.from("channel_performance_by_area").select("*").eq("area_id", areaId),
        ]);
        heading = area ? area.name : "";
        rows = data ?? [];
        areaSwitcherProps = { areas: areas ?? [], value: areaId };
      }
    } else {
      heading = "全社";
      const { data } = await supabase.from("channel_performance_company").select("*");
      rows = data ?? [];
    }
  }

  rows = [...rows].sort((a, b) => b.patient_count - a.patient_count);

  const totals = rows.reduce(
    (acc, row) => ({
      patient_count: acc.patient_count + row.patient_count,
      second_visit_count: acc.second_visit_count + row.second_visit_count,
      contracted_count: acc.contracted_count + row.contracted_count,
      spend_amount: acc.spend_amount + row.spend_amount,
    }),
    { patient_count: 0, second_visit_count: 0, contracted_count: 0, spend_amount: 0 },
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">エリア・全社シート</h1>
          <p className="text-sm text-muted-foreground">{heading}</p>
        </div>
        <div className="flex items-center gap-2">
          {profile.role === "admin" && (
            <div className="flex gap-1 rounded-lg border bg-background p-1">
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

      <div className="rounded-lg border bg-background">
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
            {rows.map((row) => (
              <TableRow key={row.channel_id}>
                <TableCell className="font-medium">{row.channel_name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.patient_count}
                </TableCell>
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
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  集計対象のデータがまだありません。
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">合計</TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {totals.patient_count}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatPercent(totals.second_visit_count, totals.patient_count)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatPercent(totals.contracted_count, totals.patient_count)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  ¥{totals.spend_amount.toLocaleString()}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatCpa(totals.spend_amount, totals.patient_count)}
                </TableCell>
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

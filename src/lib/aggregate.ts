import type { ChannelPerformanceRow } from "@/lib/types";

// The performance views carry one row per month; a period range returns one row
// per (entity, month) pair, so this collapses that down to one row per entity
// with every metric — including 集客費 — summed across the selected months.
export function aggregateChannelRows(rows: ChannelPerformanceRow[]): ChannelPerformanceRow[] {
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

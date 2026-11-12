"use client";

import type { CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface CpaDatum {
  label: string;
  cpa: number;
  color: string;
}

/**
 * One bar per channel (集客費/CPA). Each channel gets a fixed hue from a
 * validated 5-color categorical palette, keyed to the channel's stable
 * sort order (not its rank in the current period's data) so a color always
 * means the same channel even as the sorted-by-amount display order shifts.
 * Palette (blue/teal/violet/rose/amber) passes the dataviz validator in this
 * exact order — worst adjacent pair (amber↔rose) ΔE 16.6 normal / 9.4 deutan.
 */
export function CpaBarChart({ data, height = 240 }: { data: CpaDatum[]; height?: number }) {
  return (
    <div
      className="viz-root"
      style={
        {
          "--grid": "#e1e0d9",
          "--axis-text": "#898781",
        } as CSSProperties
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="none" vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--axis-text)" }} />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--axis-text)" }}
            width={56}
            tickFormatter={(value: number) => `¥${value.toLocaleString()}`}
          />
          <Tooltip
            formatter={(value) => `¥${Number(value).toLocaleString()}`}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="cpa" radius={[4, 4, 0, 0]} maxBarSize={32}>
            {data.map((entry) => (
              <Cell key={entry.label} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import type { CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface CpaDatum {
  label: string;
  cpa: number;
}

/** Single-series magnitude comparison (集客費/CPA per channel) — one hue, no legend needed. */
export function CpaBarChart({ data, height = 240 }: { data: CpaDatum[]; height?: number }) {
  return (
    <div
      className="viz-root"
      style={
        {
          "--series-1": "#2a78d6",
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
          <Bar dataKey="cpa" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

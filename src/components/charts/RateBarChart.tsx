"use client";

import type { CSSProperties } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface RateBarDatum {
  label: string;
  初診率: number;
  成約率: number;
}

/**
 * Grouped bar chart comparing 初診率 (2nd-visit rate) and 成約率 (contract rate)
 * across categories (staff / channel / gender). Colors are the dataviz skill's
 * validated categorical slots 1 (blue) and 2 (orange) — see
 * .claude memory / references/palette.md for the source values.
 */
export function RateBarChart({ data, height = 260 }: { data: RateBarDatum[]; height?: number }) {
  return (
    <div
      className="viz-root"
      style={
        {
          "--series-1": "#2a78d6",
          "--series-2": "#eb6834",
          "--grid": "#e1e0d9",
          "--axis-text": "#898781",
        } as CSSProperties
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="none" vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "var(--axis-text)" }}
            interval={0}
            angle={data.length > 5 ? -20 : 0}
            textAnchor={data.length > 5 ? "end" : "middle"}
            height={data.length > 5 ? 48 : 24}
          />
          <YAxis
            unit="%"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: "var(--axis-text)" }}
            width={40}
          />
          <Tooltip
            formatter={(value) => `${value}%`}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="初診率" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} />
          <Bar dataKey="成約率" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

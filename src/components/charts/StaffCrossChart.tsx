"use client";

import { useState } from "react";
import { RateBarChart } from "./RateBarChart";
import type {
  PatientGender,
  StaffChannelPerformanceRow,
  StaffGenderPerformanceRow,
} from "@/lib/types";

const GENDER_LABEL: Record<PatientGender, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

function rate(count: number, total: number) {
  return total === 0 ? 0 : (count / total) * 100;
}

/** Staff picker + the two per-staff breakdown charts (channel, gender), mirroring
 * the branch-dashboard prototype's StaffCrossTabs. */
export function StaffCrossChart({
  staffChannelRows,
  staffGenderRows,
}: {
  staffChannelRows: StaffChannelPerformanceRow[];
  staffGenderRows: StaffGenderPerformanceRow[];
}) {
  const staffNames = Array.from(new Set(staffChannelRows.map((r) => r.staff_name))).sort();
  const [selected, setSelected] = useState(staffNames[0] ?? "");
  const active = staffNames.includes(selected) ? selected : staffNames[0];

  if (!staffNames.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">まだ実績がありません。</p>;
  }

  const channelData = staffChannelRows
    .filter((row) => row.staff_name === active)
    .map((row) => ({
      label: row.channel_name,
      初診率: Number(rate(row.second_visit_count, row.patient_count).toFixed(1)),
      成約率: Number(rate(row.contracted_count, row.closing_count).toFixed(1)),
    }));

  const genderData = staffGenderRows
    .filter((row) => row.staff_name === active)
    .map((row) => ({
      label: GENDER_LABEL[row.gender],
      初診率: Number(rate(row.second_visit_count, row.patient_count).toFixed(1)),
      成約率: Number(rate(row.contracted_count, row.closing_count).toFixed(1)),
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        {staffNames.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setSelected(name)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              name === active
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">予約媒体別</h4>
          <RateBarChart data={channelData} height={220} />
        </div>
        <div>
          <h4 className="mb-2 text-xs font-medium text-muted-foreground">性別</h4>
          <RateBarChart data={genderData} height={220} />
        </div>
      </div>
    </div>
  );
}

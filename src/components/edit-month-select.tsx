"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function formatMonthLabel(month: string) {
  const [year, m] = month.split("-").map(Number);
  return `${year}年${m}月`;
}

// Past 18 months through next 3 months — plenty of room to fix an old
// mistake or pre-load next quarter's budget, without an unbounded list.
function buildMonthOptions(current: string) {
  const [year, month] = current.split("-").map(Number);
  const months = new Set<string>();
  for (let offset = -18; offset <= 3; offset++) {
    const d = new Date(Date.UTC(year, month - 1 + offset, 1));
    months.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  months.add(current);
  return Array.from(months).sort().reverse();
}

/** Independent single-month selector for editing past/future 集客費 — sets
 * ?editMonth=YYYY-MM, leaving the dashboard's from/to summary period alone. */
export function EditMonthSelect({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const options = buildMonthOptions(value);
  const items = Object.fromEntries(options.map((month) => [month, formatMonthLabel(month)]));

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(month) => {
        if (!month) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set("editMonth", month);
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-32 bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((month) => (
          <SelectItem key={month} value={month}>
            {formatMonthLabel(month)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

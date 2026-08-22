"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Period filter — sets ?from=YYYY-MM&to=YYYY-MM, preserving other params. */
export function MonthRangeSwitcher({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(nextFrom: string, nextTo: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", nextFrom);
    params.set("to", nextTo);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="month-range-from" className="text-xs text-muted-foreground">
        対象期間
      </Label>
      <Input
        id="month-range-from"
        type="month"
        defaultValue={from}
        className="h-8 w-36"
        onChange={(event) => {
          if (event.target.value) navigate(event.target.value, to);
        }}
      />
      <span className="text-xs text-muted-foreground">〜</span>
      <Input
        type="month"
        defaultValue={to}
        className="h-8 w-36"
        onChange={(event) => {
          if (event.target.value) navigate(from, event.target.value);
        }}
      />
    </div>
  );
}

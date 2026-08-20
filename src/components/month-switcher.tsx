"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Global month filter — sets ?month=YYYY-MM on the current URL, preserving other params. */
export function MonthSwitcher({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="month-switcher" className="text-xs text-muted-foreground">
        対象月
      </Label>
      <Input
        id="month-switcher"
        type="month"
        defaultValue={value}
        className="h-8 w-36"
        onChange={(event) => {
          if (!event.target.value) return;
          const params = new URLSearchParams(searchParams.toString());
          params.set("month", event.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
      />
    </div>
  );
}

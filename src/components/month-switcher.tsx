"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Global month filter — sets ?<paramName>=YYYY-MM on the current URL, preserving other params. */
export function MonthSwitcher({
  value,
  paramName = "month",
  label = "対象月",
}: {
  value: string;
  paramName?: string;
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const id = `month-switcher-${paramName}`;

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        type="month"
        defaultValue={value}
        className="h-8 w-36"
        onChange={(event) => {
          if (!event.target.value) return;
          const params = new URLSearchParams(searchParams.toString());
          params.set(paramName, event.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
      />
    </div>
  );
}

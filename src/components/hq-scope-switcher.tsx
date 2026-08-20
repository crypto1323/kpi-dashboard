"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function HqScopeSwitcher({
  areas,
  value,
}: {
  areas: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const items = {
    company: "全社",
    ...Object.fromEntries(areas.map((area) => [area.id, area.name])),
  };

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(scope) => {
        if (!scope) return;
        const params = new URLSearchParams(searchParams.toString());
        params.set("scope", scope);
        router.push(`${pathname}?${params.toString()}`);
      }}
    >
      <SelectTrigger className="w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="company">全社</SelectItem>
        {areas.map((area) => (
          <SelectItem key={area.id} value={area.id}>
            {area.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

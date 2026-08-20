"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AreaSwitcher({
  areas,
  value,
}: {
  areas: { id: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const items = Object.fromEntries(areas.map((area) => [area.id, area.name]));

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(areaId) => {
        router.push(`${pathname}?level=area&areaId=${areaId}`);
      }}
    >
      <SelectTrigger className="w-56">
        <SelectValue placeholder="エリアを選択" />
      </SelectTrigger>
      <SelectContent>
        {areas.map((area) => (
          <SelectItem key={area.id} value={area.id}>
            {area.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

"use client";

import { useRouter, usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Admin-only store picker (staff are locked to their own store via profile.store_id). */
export function StoreSwitcher({
  stores,
  value,
}: {
  stores: { id: string; code: string; name: string }[];
  value: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const items = Object.fromEntries(
    stores.map((store) => [store.id, `${store.code} ${store.name}`]),
  );

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(storeId) => {
        router.push(`${pathname}?storeId=${storeId}`);
      }}
    >
      <SelectTrigger className="w-56">
        <SelectValue placeholder="店舗を選択" />
      </SelectTrigger>
      <SelectContent>
        {stores.map((store) => (
          <SelectItem key={store.id} value={store.id}>
            {store.code} {store.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

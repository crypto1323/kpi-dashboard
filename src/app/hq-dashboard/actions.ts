"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";

/** 集客費は店舗×媒体×月で記録する（本部のみ編集可）。 */
export async function upsertChannelSpend(formData: FormData) {
  await requireAdmin();

  const scope = String(formData.get("scope") ?? "company");
  const month = String(formData.get("period") ?? "");
  const storeId = String(formData.get("storeId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const amount = Number.parseInt(amountRaw, 10);

  const redirectBase = `/hq-dashboard?scope=${scope}&month=${month}`;

  if (!storeId || !channelId || !month || !Number.isFinite(amount) || amount < 0) {
    redirect(`${redirectBase}&error=${encodeURIComponent("店舗・媒体・対象月・金額を入力してください。")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("channel_spends").upsert(
    { store_id: storeId, channel_id: channelId, period: `${month}-01`, amount },
    { onConflict: "store_id,channel_id,period" },
  );

  if (error) {
    redirect(`${redirectBase}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/hq-dashboard");
  redirect(redirectBase);
}

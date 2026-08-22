"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";

/** 集客費は店舗×媒体×月で記録する（本部のみ編集可）。編集対象は常に単月
 * （期間の終端月）だが、保存後は閲覧していた期間（from/to）に戻す。 */
export async function upsertChannelSpend(formData: FormData) {
  await requireAdmin();

  const scope = String(formData.get("scope") ?? "company");
  const period = String(formData.get("period") ?? "");
  const from = String(formData.get("from") ?? period);
  const to = String(formData.get("to") ?? period);
  const storeId = String(formData.get("storeId") ?? "");
  const channelId = String(formData.get("channelId") ?? "");
  const amountRaw = String(formData.get("amount") ?? "");
  const amount = Number.parseInt(amountRaw, 10);

  const redirectBase = `/hq-dashboard?scope=${scope}&from=${from}&to=${to}`;

  if (!storeId || !channelId || !period || !Number.isFinite(amount) || amount < 0) {
    redirect(`${redirectBase}&error=${encodeURIComponent("店舗・媒体・対象月・金額を入力してください。")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("channel_spends").upsert(
    { store_id: storeId, channel_id: channelId, period: `${period}-01`, amount },
    { onConflict: "store_id,channel_id,period" },
  );

  if (error) {
    redirect(`${redirectBase}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/hq-dashboard");
  redirect(redirectBase);
}

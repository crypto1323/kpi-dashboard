"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";

/** Media spend is a single figure per store x channel (annual contracts, not monthly),
 * editable at any time by HQ only — see the request that replaced the earlier monthly model. */
export async function upsertChannelSpend(
  storeId: string,
  channelId: string,
  formData: FormData,
) {
  await requireAdmin();

  const amountRaw = String(formData.get("amount") ?? "");
  const amount = Number.parseInt(amountRaw, 10);
  if (!Number.isFinite(amount) || amount < 0) {
    redirect(
      `/dashboard/report?level=store&storeId=${storeId}&error=${encodeURIComponent("金額を正しく入力してください。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("channel_spends")
    .upsert(
      { store_id: storeId, channel_id: channelId, amount },
      { onConflict: "store_id,channel_id" },
    );

  if (error) {
    redirect(
      `/dashboard/report?level=store&storeId=${storeId}&error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/dashboard/report");
  redirect(`/dashboard/report?level=store&storeId=${storeId}`);
}

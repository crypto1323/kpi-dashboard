"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/dal";

export async function upsertSpend(formData: FormData) {
  const profile = await getCurrentProfile();
  if (profile.role === "area_manager") {
    redirect("/dashboard/spend");
  }

  const storeId =
    profile.role === "admin"
      ? String(formData.get("storeId") ?? "")
      : profile.store_id;
  const channelId = String(formData.get("channelId") ?? "");
  const month = String(formData.get("period") ?? ""); // "YYYY-MM"
  const amountRaw = String(formData.get("amount") ?? "");
  const amount = Number.parseInt(amountRaw, 10);

  if (!storeId || !channelId || !month || !Number.isFinite(amount) || amount < 0) {
    redirect(
      `/dashboard/spend?error=${encodeURIComponent("媒体・対象月・金額を入力してください。")}&storeId=${storeId ?? ""}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("channel_spends").upsert(
    {
      store_id: storeId,
      channel_id: channelId,
      period: `${month}-01`,
      amount,
    },
    { onConflict: "store_id,channel_id,period" },
  );

  if (error) {
    redirect(
      `/dashboard/spend?error=${encodeURIComponent(error.message)}&storeId=${storeId}`,
    );
  }

  revalidatePath("/dashboard/spend");
  revalidatePath("/dashboard/report");
  redirect(`/dashboard/spend?storeId=${storeId}`);
}

export async function deleteSpend(id: string, formData: FormData) {
  await getCurrentProfile();
  const storeId = String(formData.get("storeId") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.from("channel_spends").delete().eq("id", id);

  if (error) {
    redirect(
      `/dashboard/spend?error=${encodeURIComponent(error.message)}&storeId=${storeId}`,
    );
  }

  revalidatePath("/dashboard/spend");
  revalidatePath("/dashboard/report");
  redirect(`/dashboard/spend?storeId=${storeId}`);
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { requireAdminSectionUnlocked } from "@/lib/admin-gate";
import { monthStartDate, prevMonthOf } from "@/lib/month";

/** 集客費は店舗×媒体×月で記録する（本部のみ編集可）。編集対象月（period）は
 * サマリーの表示期間（from/to）とは独立しており、保存後はどちらも維持したまま
 * 同じ画面に戻す。 */
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

  const redirectBase = `/hq-dashboard?scope=${scope}&from=${from}&to=${to}&editMonth=${period}`;
  await requireAdminSectionUnlocked(redirectBase);

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

/** 「前月費用を全店舗に一括反映」。入力対象月（period）のスコープ内 全店舗×
 * 全媒体ぶんを、前月の channel_spends でまとめて上書きする — 毎月ひとつずつ
 * セルをクリックして回る作業をゼロにするための一括コピー。既存の入力値は
 * 上書きされる。 */
export async function copyPreviousMonthSpends(formData: FormData) {
  await requireAdmin();

  const scope = String(formData.get("scope") ?? "company");
  const period = String(formData.get("period") ?? "");
  const from = String(formData.get("from") ?? period);
  const to = String(formData.get("to") ?? period);
  const redirectBase = `/hq-dashboard?scope=${scope}&from=${from}&to=${to}&editMonth=${period}`;
  await requireAdminSectionUnlocked(redirectBase);

  if (!period) {
    redirect(`${redirectBase}&error=${encodeURIComponent("対象月を選択してください。")}`);
  }

  const supabase = await createClient();
  const isCompany = scope === "company";
  const { data: scopeStores } = isCompany
    ? await supabase.from("stores").select("id").eq("is_active", true)
    : await supabase.from("stores").select("id").eq("is_active", true).eq("area_id", scope);
  const storeIds = (scopeStores ?? []).map((store) => store.id);

  if (!storeIds.length) {
    redirect(`${redirectBase}&error=${encodeURIComponent("対象スコープに店舗がありません。")}`);
  }

  const prevPeriod = monthStartDate(prevMonthOf(period));
  const currentPeriod = monthStartDate(period);

  const { data: prevSpends, error: fetchError } = await supabase
    .from("channel_spends")
    .select("store_id, channel_id, amount")
    .in("store_id", storeIds)
    .eq("period", prevPeriod);

  if (fetchError) {
    redirect(`${redirectBase}&error=${encodeURIComponent(fetchError.message)}`);
  }

  if (!prevSpends?.length) {
    redirect(
      `${redirectBase}&error=${encodeURIComponent("前月の集客費データがありません。")}`,
    );
  }

  const rows = prevSpends.map((row) => ({
    store_id: row.store_id,
    channel_id: row.channel_id,
    period: currentPeriod,
    amount: row.amount,
  }));

  const { error } = await supabase
    .from("channel_spends")
    .upsert(rows, { onConflict: "store_id,channel_id,period" });

  if (error) {
    redirect(`${redirectBase}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/hq-dashboard");
  redirect(`${redirectBase}&copied=${rows.length}`);
}

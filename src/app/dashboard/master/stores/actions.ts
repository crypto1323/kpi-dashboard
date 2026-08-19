"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";

function parseStoreForm(formData: FormData) {
  const areaId = String(formData.get("areaId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const openedAt = String(formData.get("openedAt") ?? "").trim();

  return { areaId, code, name, openedAt: openedAt || null };
}

export async function createStore(formData: FormData) {
  await requireAdmin();
  const { areaId, code, name, openedAt } = parseStoreForm(formData);
  if (!areaId || !code || !name) {
    redirect(
      `/dashboard/master/stores/new?error=${encodeURIComponent("エリア・店舗コード・店舗名は必須です。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("stores").insert({
    area_id: areaId,
    code,
    name,
    opened_at: openedAt,
  });
  if (error) {
    const message = error.code === "23505" ? "この店舗コードは既に使用されています。" : error.message;
    redirect(`/dashboard/master/stores/new?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard/master/stores");
  redirect("/dashboard/master/stores");
}

export async function updateStore(id: string, formData: FormData) {
  await requireAdmin();
  const { areaId, code, name, openedAt } = parseStoreForm(formData);
  if (!areaId || !code || !name) {
    redirect(
      `/dashboard/master/stores/${id}?error=${encodeURIComponent("エリア・店舗コード・店舗名は必須です。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ area_id: areaId, code, name, opened_at: openedAt })
    .eq("id", id);
  if (error) {
    const message = error.code === "23505" ? "この店舗コードは既に使用されています。" : error.message;
    redirect(`/dashboard/master/stores/${id}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard/master/stores");
  redirect("/dashboard/master/stores");
}

export async function setStoreActive(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const isActive = formData.get("isActive") === "true";

  const supabase = await createClient();
  await supabase.from("stores").update({ is_active: isActive }).eq("id", id);

  revalidatePath("/dashboard/master/stores");
}

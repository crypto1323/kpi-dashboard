"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { requireAdminSectionUnlocked } from "@/lib/admin-gate";

function parseStoreForm(formData: FormData) {
  const areaId = String(formData.get("areaId") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const openedAt = String(formData.get("openedAt") ?? "").trim();
  const accessPassword = String(formData.get("accessPassword") ?? "").trim();

  return { areaId, code, name, openedAt: openedAt || null, accessPassword: accessPassword || null };
}

export async function createStore(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/stores/new");
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
  await requireAdminSectionUnlocked(`/dashboard/master/stores/${id}`);
  const { areaId, code, name, openedAt, accessPassword } = parseStoreForm(formData);
  if (!areaId || !code || !name) {
    redirect(
      `/dashboard/master/stores/${id}?error=${encodeURIComponent("エリア・店舗コード・店舗名は必須です。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ area_id: areaId, code, name, opened_at: openedAt, access_password: accessPassword })
    .eq("id", id);
  if (error) {
    const message = error.code === "23505" ? "この店舗コードは既に使用されています。" : error.message;
    redirect(`/dashboard/master/stores/${id}?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/dashboard/master/stores");
  redirect("/dashboard/master/stores");
}

/** Quick inline edit from the store list — touches only access_password. */
export async function updateStoreAccessPassword(id: string, formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/stores");
  const accessPassword = String(formData.get("accessPassword") ?? "").trim();

  const supabase = await createClient();
  await supabase
    .from("stores")
    .update({ access_password: accessPassword || null })
    .eq("id", id);

  revalidatePath("/dashboard/master/stores");
}

export async function setStoreActive(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/stores");
  const id = String(formData.get("id"));
  const isActive = formData.get("isActive") === "true";

  const supabase = await createClient();
  await supabase.from("stores").update({ is_active: isActive }).eq("id", id);

  revalidatePath("/dashboard/master/stores");
}

/** Soft delete: 過去の患者・集客費データがこの店舗を参照しているため、行は
 * 物理削除せず is_deleted を立てて一覧から外すだけにする（is_active も
 * falseにして、登録フォームの選択肢にも出てこないようにする）。 */
export async function deleteStore(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/stores");
  const id = String(formData.get("id"));

  const supabase = await createClient();
  await supabase.from("stores").update({ is_deleted: true, is_active: false }).eq("id", id);

  revalidatePath("/dashboard/master/stores");
}

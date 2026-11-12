"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { requireAdminSectionUnlocked } from "@/lib/admin-gate";

function parseChannelForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const sortOrderRaw = String(formData.get("sortOrder") ?? "0").trim();
  const sortOrder = Number.parseInt(sortOrderRaw, 10);

  return {
    name,
    category: category || null,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
  };
}

export async function createChannel(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/channels/new");
  const { name, category, sortOrder } = parseChannelForm(formData);
  if (!name) {
    redirect(
      `/dashboard/master/channels/new?error=${encodeURIComponent("媒体名を入力してください。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("channels")
    .insert({ name, category, sort_order: sortOrder });
  if (error) {
    redirect(
      `/dashboard/master/channels/new?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/dashboard/master/channels");
  redirect("/dashboard/master/channels");
}

export async function updateChannel(id: string, formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked(`/dashboard/master/channels/${id}`);
  const { name, category, sortOrder } = parseChannelForm(formData);
  if (!name) {
    redirect(
      `/dashboard/master/channels/${id}?error=${encodeURIComponent("媒体名を入力してください。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("channels")
    .update({ name, category, sort_order: sortOrder })
    .eq("id", id);
  if (error) {
    redirect(
      `/dashboard/master/channels/${id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/dashboard/master/channels");
  redirect("/dashboard/master/channels");
}

export async function setChannelActive(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/channels");
  const id = String(formData.get("id"));
  const isActive = formData.get("isActive") === "true";

  const supabase = await createClient();
  await supabase.from("channels").update({ is_active: isActive }).eq("id", id);

  revalidatePath("/dashboard/master/channels");
}

/** Soft delete: 過去の患者・集客費データがこの媒体を参照しているため、行は
 * 物理削除せず is_deleted を立てて一覧から外すだけにする（is_active も
 * falseにして、登録フォームの選択肢にも出てこないようにする）。 */
export async function deleteChannel(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/channels");
  const id = String(formData.get("id"));

  const supabase = await createClient();
  await supabase.from("channels").update({ is_deleted: true, is_active: false }).eq("id", id);

  revalidatePath("/dashboard/master/channels");
}

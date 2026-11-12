"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import { requireAdminSectionUnlocked } from "@/lib/admin-gate";

function parseName(formData: FormData) {
  return String(formData.get("name") ?? "").trim();
}

export async function createArea(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/areas/new");
  const name = parseName(formData);
  if (!name) {
    redirect(
      `/dashboard/master/areas/new?error=${encodeURIComponent("エリア名を入力してください。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("areas").insert({ name });
  if (error) {
    redirect(
      `/dashboard/master/areas/new?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/dashboard/master/areas");
  redirect("/dashboard/master/areas");
}

export async function updateArea(id: string, formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked(`/dashboard/master/areas/${id}`);
  const name = parseName(formData);
  if (!name) {
    redirect(
      `/dashboard/master/areas/${id}?error=${encodeURIComponent("エリア名を入力してください。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("areas").update({ name }).eq("id", id);
  if (error) {
    redirect(
      `/dashboard/master/areas/${id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/dashboard/master/areas");
  redirect("/dashboard/master/areas");
}

export async function setAreaActive(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/areas");
  const id = String(formData.get("id"));
  const isActive = formData.get("isActive") === "true";

  const supabase = await createClient();
  await supabase.from("areas").update({ is_active: isActive }).eq("id", id);

  revalidatePath("/dashboard/master/areas");
}

/** Soft delete: 過去の店舗・実績データがこのエリアを参照しているため、行は
 * 物理削除せず is_deleted を立てて一覧から外すだけにする（is_active も
 * falseにして、登録フォームの選択肢にも出てこないようにする）。 */
export async function deleteArea(formData: FormData) {
  await requireAdmin();
  await requireAdminSectionUnlocked("/dashboard/master/areas");
  const id = String(formData.get("id"));

  const supabase = await createClient();
  await supabase.from("areas").update({ is_deleted: true, is_active: false }).eq("id", id);

  revalidatePath("/dashboard/master/areas");
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/dal";
import type { ProfileRole } from "@/lib/types";

const ROLES: ProfileRole[] = ["staff", "area_manager", "admin"];

export async function updateUserProfile(id: string, formData: FormData) {
  await requireAdmin();

  const displayName = String(formData.get("displayName") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "staff");
  const role = ROLES.includes(roleRaw as ProfileRole)
    ? (roleRaw as ProfileRole)
    : "staff";
  const storeId = String(formData.get("storeId") ?? "");
  const areaId = String(formData.get("areaId") ?? "");

  if (!displayName) {
    redirect(
      `/dashboard/master/users/${id}?error=${encodeURIComponent("表示名を入力してください。")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      role,
      store_id: storeId || null,
      area_id: areaId || null,
    })
    .eq("id", id);

  if (error) {
    redirect(
      `/dashboard/master/users/${id}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/dashboard/master/users");
  redirect("/dashboard/master/users");
}

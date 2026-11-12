"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_UNLOCK_COOKIE } from "@/lib/admin-lock";

/** Re-locks every section on this browser at once — the admin/HQ gate and
 * every store's gate — and drops the shared backing session. Useful on a
 * shared computer once someone is done. */
export async function lockEverything() {
  const cookieStore = await cookies();
  for (const { name } of cookieStore.getAll()) {
    if (name === ADMIN_UNLOCK_COOKIE || name.startsWith("store_unlock_")) {
      cookieStore.delete(name);
    }
  }

  const supabase = await createClient();
  await supabase.auth.signOut();

  redirect("/dashboard/patients");
}

"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_UNLOCK_COOKIE, adminUnlockToken } from "@/lib/admin-lock";

/** Checks the shared admin/HQ password, and — on a match — transparently
 * signs into the app's one backing account so RLS-protected queries on
 * these pages keep working, without the visitor ever seeing an email field. */
export async function unlockAdminSection(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const redirectTo = String(formData.get("redirectTo") ?? "/dashboard/report");

  if (!password) {
    redirect(`${redirectTo}?adminLockError=${encodeURIComponent("パスワードを入力してください。")}`);
  }
  if (password !== process.env.SHARED_ACCOUNT_PASSWORD) {
    redirect(`${redirectTo}?adminLockError=${encodeURIComponent("パスワードが正しくありません。")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.SHARED_ACCOUNT_EMAIL!,
    password: process.env.SHARED_ACCOUNT_PASSWORD!,
  });
  if (error) {
    redirect(`${redirectTo}?adminLockError=${encodeURIComponent(error.message)}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_UNLOCK_COOKIE, adminUnlockToken(process.env.SHARED_ACCOUNT_PASSWORD!), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  redirect(redirectTo);
}

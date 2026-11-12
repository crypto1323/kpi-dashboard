"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string } | undefined;

/** Single shared password — everyone who knows it signs in as one backing
 * account (role=admin). No per-user email/account to manage. */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");

  if (!password) {
    return { error: "パスワードを入力してください。" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: process.env.SHARED_ACCOUNT_EMAIL!,
    password,
  });

  if (error) {
    return { error: "パスワードが正しくありません。" };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

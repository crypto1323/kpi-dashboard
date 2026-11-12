import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Silently establishes the app's one backing session if this browser
 * doesn't already have one. Browsing 店舗シート itself isn't gated by any
 * login step — only a store's own password (if the admin set one) protects
 * that store's patient data — but Postgres RLS still needs a real session
 * for any query to return rows, so this fills that in invisibly. */
export async function ensureBackingSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    await supabase.auth.signInWithPassword({
      email: process.env.SHARED_ACCOUNT_EMAIL!,
      password: process.env.SHARED_ACCOUNT_PASSWORD!,
    });
  }
  return supabase;
}

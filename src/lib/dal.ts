import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Verifies the session and loads the caller's profile (role + store/area
 * scope). Memoized per request so layouts and pages can call it freely
 * without duplicate queries. Redirects to /login when unauthenticated —
 * callers can assume a non-null profile.
 */
export const getCurrentProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    redirect("/login");
  }

  return profile;
});

/** Guards admin-only pages/actions. RLS enforces this independently at the DB level. */
export async function requireAdmin(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }
  return profile;
}

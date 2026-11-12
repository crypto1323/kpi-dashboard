import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_UNLOCK_COOKIE, adminUnlockToken } from "@/lib/admin-lock";
import { AdminPasswordGate } from "@/components/admin-password-gate";

/** Has this browser already proven it knows the shared admin/HQ password? */
export async function isAdminSectionUnlocked() {
  const cookieStore = await cookies();
  return (
    cookieStore.get(ADMIN_UNLOCK_COOKIE)?.value ===
    adminUnlockToken(process.env.SHARED_ACCOUNT_PASSWORD!)
  );
}

/**
 * Call at the top of every admin-only PAGE (not layout — Next.js caches
 * layouts client-side and does not re-run them on sibling navigation, so a
 * layout-level check can keep showing stale "unlocked" content after the
 * cookie is cleared elsewhere; pages always re-run). Returns the password
 * prompt to render in place of the page when locked, or null when unlocked.
 */
export async function adminGateOrNull(redirectTo: string) {
  const unlocked = await isAdminSectionUnlocked();
  return unlocked ? null : <AdminPasswordGate redirectTo={redirectTo} />;
}

/**
 * Call at the top of every admin-only SERVER ACTION (create/update/delete
 * for areas/stores/channels, upsertChannelSpend, …). requireAdmin() alone is
 * no longer enough: the store-password gate and the admin-password gate both
 * sign into the same one backing Supabase account, so a role check can't
 * tell "knows the admin password" apart from "knows some store's password."
 * This is the thing that actually enforces that distinction.
 */
export async function requireAdminSectionUnlocked(redirectTo: string) {
  const unlocked = await isAdminSectionUnlocked();
  if (!unlocked) {
    redirect(redirectTo);
  }
}

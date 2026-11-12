import { createHash } from "node:crypto";

/** Cookie proving this browser already typed the shared admin/HQ password —
 * value is a hash of that password, so it can't be forged, and it's
 * session-only (no maxAge) so a reload doesn't re-prompt but closing the
 * browser does. Gates エリア・全社シート / 本部ダッシュボード / マスタ管理
 * collectively — independent of any per-store password. */
export const ADMIN_UNLOCK_COOKIE = "admin_section_unlock";

export function adminUnlockToken(password: string) {
  return createHash("sha256").update(`admin-section:${password}`).digest("hex");
}

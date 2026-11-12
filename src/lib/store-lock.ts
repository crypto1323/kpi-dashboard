import { createHash } from "node:crypto";

/** Cookie proves the browser already typed the right password for this store
 * — its value is a hash of (storeId + real password), so it can't be forged
 * without knowing the password, and it's session-only (no maxAge) so a
 * reload doesn't re-prompt but closing the browser does. */
export function storeUnlockCookieName(storeId: string) {
  return `store_unlock_${storeId}`;
}

export function storeUnlockToken(storeId: string, password: string) {
  return createHash("sha256").update(`${storeId}:${password}`).digest("hex");
}

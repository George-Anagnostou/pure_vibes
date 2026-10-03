import "server-only";
import { createHash, randomInt } from "node:crypto";
import { hashAgentKey, newAgentKey } from "@/lib/glassbox/agent-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// One-time install codes for `curl -fsSL <site>/i/<code> | sh`. Short enough to type,
// single use, 15-minute lifetime. Only a hash of the code is stored, and the agent
// key is minted at redemption, so no raw key ever sits in the database.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L
export const CODE_LENGTH = 8;
export const CODE_TTL_MS = 15 * 60_000;

export const hashCode = (code: string) =>
  createHash("sha256").update(code.toUpperCase()).digest("hex");

export const isCodeShape = (code: string) =>
  new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`, "i").test(code);

export async function createInstallCode(
  userId: string,
  keyName = "Claude Code",
) {
  const code = Array.from(
    { length: CODE_LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)],
  ).join("");
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  const { error } = await createAdminClient()
    .from("install_codes")
    .insert({
      code_hash: hashCode(code),
      user_id: userId,
      key_name: keyName,
      expires_at: expiresAt.toISOString(),
    });
  if (error) throw error;
  return { code, expiresAt };
}

// Claims the code (atomically: only one redemption can win) and mints a fresh key for
// its owner. Returns null when the code is unknown, expired or already used.
export async function redeemInstallCode(code: string): Promise<string | null> {
  if (!isCodeShape(code)) return null;
  const admin = createAdminClient();
  const { data: claimed, error } = await admin
    .from("install_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", hashCode(code))
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("user_id, key_name")
    .maybeSingle();
  if (error) throw error;
  if (!claimed) return null;
  const key = newAgentKey();
  const stamp = new Date().toISOString().slice(0, 10);
  const { error: keyErr } = await admin.from("agent_keys").insert({
    user_id: claimed.user_id,
    name: `${claimed.key_name} (installed ${stamp})`,
    key_hash: hashAgentKey(key),
  });
  if (keyErr) throw keyErr;
  return key;
}

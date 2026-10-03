import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

// Agents authenticate with `Authorization: Bearer gb_...`. We store only the sha256.
export function hashAgentKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function newAgentKey() {
  return `gb_${randomBytes(24).toString("base64url")}`;
}

export async function requireAgent(request: Request) {
  const key = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();
  if (!key?.startsWith("gb_"))
    throw new HttpError(
      401,
      "Missing Glass Box agent key (Authorization: Bearer gb_...).",
    );
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("agent_keys")
    .select("id, user_id, name")
    .eq("key_hash", hashAgentKey(key))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(401, "Unknown Glass Box agent key.");
  await admin
    .from("agent_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return {
    agentKeyId: data.id,
    userId: data.user_id,
    agentName: data.name,
    admin,
  };
}

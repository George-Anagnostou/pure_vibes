import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { hashAgentKey, newAgentKey } from "@/lib/glassbox/agent-auth";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST /api/agent-keys — signed-in human mints a key for an agent. The raw key is returned once.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const { name } = await readJson(
      request,
      z.object({ name: z.string().trim().min(1).max(100) }),
    );
    const key = newAgentKey();
    const { error } = await createAdminClient()
      .from("agent_keys")
      .insert({ user_id: user.id, name, key_hash: hashAgentKey(key) });
    if (error) throw error;
    return json({ key, name }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}

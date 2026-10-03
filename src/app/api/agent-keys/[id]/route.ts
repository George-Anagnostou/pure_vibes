import { requireUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, HttpError, json } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// DELETE /api/agent-keys/:id — the signed-in owner revokes one of their agent keys.
// Agents using it get 401 on their next call.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new HttpError(400, "Invalid key id.");
    const { data, error } = await createAdminClient()
      .from("agent_keys")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id");
    if (error) throw error;
    if (!data?.length) throw new HttpError(404, "Key not found.");
    return json({ revoked: id });
  } catch (error) {
    return errorResponse(error);
  }
}

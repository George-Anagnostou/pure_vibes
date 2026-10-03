import { requireUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, HttpError, json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireUser();
    const { id } = await params;
    const { error } = await supabase.rpc("reject_review", { p_review_id: id });
    if (error) throw new HttpError(409, error.message);
    return json({ status: "rejected" });
  } catch (error) {
    return errorResponse(error);
  }
}

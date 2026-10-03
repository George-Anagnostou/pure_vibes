import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { assertSameOrigin, errorResponse, HttpError, json } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const { supabase } = await requireUser();
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new HttpError(404, "Review not found.");
    const { error } = await supabase.rpc("reject_review", { p_review_id: id });
    // P0002 = not this user's review, or already decided. Never echo other DB errors.
    if (error)
      throw error.code === "P0002"
        ? new HttpError(409, "Review not found or already decided.")
        : error;
    return json({ status: "rejected" });
  } catch (error) {
    return errorResponse(error);
  }
}

import { requireUser } from "@/lib/auth";
import { errorResponse, json } from "@/lib/http";
import { getBillingPlan } from "@/lib/stripe/plan";

export async function GET() {
  try {
    await requireUser();
    return json({ plan: await getBillingPlan() });
  } catch (error) {
    return errorResponse(error);
  }
}

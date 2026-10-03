import { requireUser } from "@/lib/auth";
import { requireSubscription, requiredEnv } from "@/lib/env";
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readJson,
} from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { runBriefWorkflow, workflowInput } from "@/lib/ai/workflow";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const { data, error } = await supabase
      .from("workflow_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return json({ runs: data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireUser();
    const { brief } = await readJson(request, workflowInput);
    if (requireSubscription()) {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .eq("price_id", requiredEnv("STRIPE_PRICE_ID"))
        .in("status", ["active", "trialing"])
        .limit(1);
      if (error) throw error;
      if (!data.length)
        throw new HttpError(
          402,
          "An active subscription is required. If you just paid, wait for billing to sync and retry.",
        );
    }
    requiredEnv("OPENAI_API_KEY");
    const model = process.env.AI_MODEL || "gpt-4.1-mini";
    const admin = createAdminClient();
    const { data: runId, error: reserveError } = await admin.rpc(
      "reserve_workflow",
      { p_user_id: user.id, p_input: brief, p_model: model },
    );
    if (reserveError?.code === "P0001")
      throw new HttpError(
        429,
        "You have reached 10 runs per hour. Try again later.",
      );
    if (reserveError) throw reserveError;
    try {
      const result = await runBriefWorkflow(
        brief,
        model,
        AbortSignal.timeout(45_000),
      );
      const { error } = await admin
        .from("workflow_runs")
        .update({
          status: "completed",
          output: result.output,
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      if (error) throw error;
      return json({ id: runId, ...result }, 201);
    } catch (error) {
      const { error: persistError } = await admin
        .from("workflow_runs")
        .update({
          status: "failed",
          error: "Workflow failed. Please try again.",
          completed_at: new Date().toISOString(),
        })
        .eq("id", runId);
      if (persistError)
        console.error("workflow_failure_persistence_failed", { runId });
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

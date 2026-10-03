import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { requireAgent } from "@/lib/glassbox/agent-auth";
import { runCheckpoint } from "@/lib/glassbox/checkpoint";
import { createReview, getContract, waitForContract, type ContractLookup } from "@/lib/glassbox/reviews";
import { requestSpend } from "@/lib/glassbox/spend";
import { HttpError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

// Glass Box MCP server. Every tool is scoped to the user who owns the gb_ key.
// mcp-handler ignores the path, so /api/mcp/mcp is the canonical endpoint.

type AgentAuth = { userId: string; agentName: string };
type ToolCtx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

function agentFrom(ctx: ToolCtx): AgentAuth {
  const extra = ctx.http?.authInfo?.extra;
  if (typeof extra?.userId !== "string") throw new HttpError(401, "Missing Glass Box agent key.");
  return { userId: extra.userId, agentName: typeof extra.agentName === "string" ? extra.agentName : "agent" };
}

const text = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

function toolError(error: unknown) {
  let message = "Glass Box request failed. Try again.";
  if (error instanceof HttpError) message = error.message;
  else console.error("glassbox_mcp_tool_failed", { type: error instanceof Error ? error.name : "Unknown" });
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function contractPayload(lookup: ContractLookup) {
  if (lookup.status === "approved") return { status: "approved", contract: lookup.contract };
  if (lookup.status === "pending") {
    return { status: "pending", approval_url: lookup.approval_url, next: "Ask the human to open approval_url, then call get_contract" };
  }
  return { status: lookup.status, approval_url: lookup.approval_url, next: "The human did not approve this plan. Do not execute it." };
}

const reviewId = z.uuid().describe("review_id returned by review_plan");

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "review_plan",
      {
        title: "Review plan with Glass Box",
        description:
          "Call this BEFORE executing any multi-step plan. Glass Box reveals what the plan is really optimizing for, critiques it, and asks the human to rank priorities on their phone. Waits up to ~45s for approval. When a contract comes back, follow it: obey its ranked priorities and hard lines, call `checkpoint` before each consequential action, and `request_spend` before spending money. If status is pending, ask the human to open approval_url, then call get_contract.",
        inputSchema: z.object({
          task: z.string().trim().min(1).max(4000).describe("What the human asked you to do"),
          plan: z.string().trim().min(1).max(12000).describe("Your full step-by-step plan"),
          agent_name: z.string().trim().min(1).max(100).optional(),
        }),
      },
      async ({ task, plan, agent_name }, ctx) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          const review = await createReview({ userId: agent.userId, agentName: agent_name ?? agent.agentName, task, plan });
          const lookup = await waitForContract(review.review_id, agent.userId, 45_000);
          return text({
            review_id: review.review_id,
            approval_url: review.approval_url,
            revealed: { headline: review.revealed.headline, priorities: review.revealed.priorities },
            critique: {
              verdict: review.critique.verdict,
              summary: review.critique.summary,
              hard_line_risks: review.critique.hard_line_risks,
            },
            ...contractPayload(lookup),
          });
        } catch (error) {
          return toolError(error);
        }
      },
    );

    server.registerTool(
      "get_contract",
      {
        title: "Get priority contract",
        description: "Fetch the human-approved priority contract for a review. Follow it exactly once approved; if pending, wait and call again.",
        inputSchema: z.object({ review_id: reviewId }),
      },
      async ({ review_id }, ctx) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          return text({ review_id, ...contractPayload(await getContract(review_id, agent.userId)) });
        } catch (error) {
          return toolError(error);
        }
      },
    );

    server.registerTool(
      "checkpoint",
      {
        title: "Checkpoint an action",
        description:
          "Call before each consequential action (fetching a resource, contacting someone, submitting, provisioning, buying). Returns allow / warn / block. On block, do NOT perform the action. On warn, reconsider or ask the human.",
        inputSchema: z.object({
          review_id: reviewId,
          action: z.string().trim().min(1).max(200).describe("Verb, e.g. fetch, email, provision, purchase"),
          target: z.string().trim().min(1).max(1000).describe("URL, path, person, or resource"),
          details: z.record(z.string(), z.unknown()).optional().describe("Why, and anything relevant (e.g. restricted: true)"),
        }),
      },
      async ({ review_id, action, target, details }, ctx) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          return text(await runCheckpoint(review_id, agent.userId, { action, target, details }));
        } catch (error) {
          return toolError(error);
        }
      },
    );

    server.registerTool(
      "request_spend",
      {
        title: "Request to spend money",
        description: "Ask before spending money. Enforces the human's budget cap. Only proceed if allowed is true.",
        inputSchema: z.object({
          review_id: reviewId,
          amount_cents: z.number().int().positive().max(10_000_000),
          purpose: z.string().trim().min(1).max(300),
        }),
      },
      async ({ review_id, amount_cents, purpose }, ctx) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          return text(await requestSpend(review_id, agent.userId, amount_cents, purpose));
        } catch (error) {
          return toolError(error);
        }
      },
    );
  },
  { serverInfo: { name: "glass-box", version: "0.1.0" } },
);

const authed = withMcpAuth(
  handler,
  async (req, bearerToken) => {
    if (!bearerToken?.startsWith("gb_")) return undefined;
    try {
      const { userId, agentName, agentKeyId } = await requireAgent(req);
      return { token: bearerToken, clientId: agentKeyId, scopes: [], extra: { userId, agentName } };
    } catch (error) {
      if (error instanceof HttpError) return undefined;
      throw error;
    }
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };

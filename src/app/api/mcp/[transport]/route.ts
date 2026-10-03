import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { requireAgent } from "@/lib/glassbox/agent-auth";
import { runCheckpoint } from "@/lib/glassbox/checkpoint";
import {
  createReview,
  waitForContract,
  type ContractLookup,
} from "@/lib/glassbox/reviews";
import { requestSpend } from "@/lib/glassbox/spend";
import { HttpError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;
// Claude Code abandons an MCP call after ~60s, so every tool answers well inside that:
// align returns by ~45s after the request started (Reveal + Critique take 10-25s),
// and get_contract long-polls up to 40s per call.
const ALIGN_WAIT_UNTIL_MS = 45_000;
const GET_CONTRACT_WAIT_MS = 40_000;

// Glass Box MCP server. Every tool is scoped to the user who owns the gb_ key.
// mcp-handler ignores the path, so /api/mcp/mcp is the canonical endpoint.

type AgentAuth = { userId: string; agentName: string };
type ToolCtx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

function agentFrom(ctx: ToolCtx): AgentAuth {
  const extra = ctx.http?.authInfo?.extra;
  if (typeof extra?.userId !== "string")
    throw new HttpError(401, "Missing Glass Box agent key.");
  return {
    userId: extra.userId,
    agentName: typeof extra.agentName === "string" ? extra.agentName : "agent",
  };
}

const text = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

function toolError(error: unknown) {
  let message = "Glass Box request failed. Try again.";
  if (error instanceof HttpError) message = error.message;
  else
    console.error("glassbox_mcp_tool_failed", {
      type: error instanceof Error ? error.name : "Unknown",
    });
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

function contractPayload(lookup: ContractLookup) {
  if (lookup.status === "approved")
    return { status: "approved", contract: lookup.contract };
  if (lookup.status === "pending") {
    return {
      status: "pending",
      align_url: lookup.align_url,
      next: "Show the human align_url (open it for them if you can), then call get_contract — it waits for them to submit. Repeat get_contract until approved.",
    };
  }
  return {
    status: lookup.status,
    align_url: lookup.align_url,
    next: "The human did not approve this plan. Do not execute it.",
  };
}

const reviewId = z.uuid().describe("review_id returned by align");

const ALIGN_DESCRIPTION =
  "Call this BEFORE executing any multi-step plan, and again whenever the plan changes materially. Send the task, your full plan, and YOUR OWN ranked priorities. Glass Box reveals what the plan actually optimizes for (from its steps, not your words), flags what you missed, and asks the human to re-rank priorities at align_url. Waits briefly for the human to submit. When a contract comes back, it is binding: follow its ranked_priorities, plan_guidance and hard_lines, call `checkpoint` before each consequential action, and `request_spend` before spending money. If status is pending, show the human align_url, then call get_contract.";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "align",
      {
        title: "Align plan with the human (Glass Box)",
        description: ALIGN_DESCRIPTION,
        inputSchema: z.object({
          task: z
            .string()
            .trim()
            .min(1)
            .max(4000)
            .describe("What the human asked you to do"),
          plan: z
            .string()
            .trim()
            .min(1)
            .max(12000)
            .describe("Your full step-by-step plan"),
          its_priorities: z
            .array(z.string().trim().min(1).max(100))
            .max(12)
            .describe(
              "What YOU are optimizing for, highest first, e.g. ['Cost', 'Reliability', 'Speed']",
            ),
          agent_name: z.string().trim().min(1).max(100).optional(),
        }),
      },
      async ({ task, plan, its_priorities, agent_name }, ctx) => {
        const started = Date.now();
        try {
          const agent = agentFrom(ctx as ToolCtx);
          const review = await createReview({
            userId: agent.userId,
            agentName: agent_name ?? agent.agentName,
            task,
            plan,
            stated: its_priorities,
          });
          const lookup = await waitForContract(
            review.review_id,
            agent.userId,
            started + ALIGN_WAIT_UNTIL_MS,
          );
          return text({
            review_id: review.review_id,
            align_url: review.align_url,
            stated_vs_revealed: review.critique.stated_vs_revealed,
            revealed: {
              headline: review.revealed.headline,
              priorities: review.revealed.priorities,
              ignored: review.revealed.ignored,
            },
            suggestions: review.critique.missing_priorities,
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
        description:
          "Wait (up to ~40s) for the human-approved priority contract for a review. Follow it exactly once approved; if still pending, call again.",
        inputSchema: z.object({ review_id: reviewId }),
      },
      async ({ review_id }, ctx) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          return text({
            review_id,
            ...contractPayload(
              await waitForContract(
                review_id,
                agent.userId,
                Date.now() + GET_CONTRACT_WAIT_MS,
              ),
            ),
          });
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
          action: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .describe("Verb, e.g. fetch, email, provision, purchase"),
          target: z
            .string()
            .trim()
            .min(1)
            .max(1000)
            .describe("URL, path, person, or resource"),
          details: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("Why, and anything relevant (e.g. restricted: true)"),
        }),
      },
      async ({ review_id, action, target, details }, ctx) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          return text(
            await runCheckpoint(review_id, agent.userId, {
              action,
              target,
              details,
            }),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    );

    server.registerTool(
      "request_spend",
      {
        title: "Request to spend money",
        description:
          "Ask before spending money. Enforces the human's budget cap. Only proceed if allowed is true.",
        inputSchema: z.object({
          review_id: reviewId,
          amount_cents: z.number().int().positive().max(10_000_000),
          purpose: z.string().trim().min(1).max(300),
        }),
      },
      async ({ review_id, amount_cents, purpose }, ctx) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          return text(
            await requestSpend(review_id, agent.userId, amount_cents, purpose),
          );
        } catch (error) {
          return toolError(error);
        }
      },
    );

    // Shown in Claude Code as /glassbox:align — the human asks the agent to realign on demand.
    server.registerPrompt(
      "align",
      {
        title: "Realign with Glass Box",
        description:
          "Ask the agent to send its current plan and priorities to Glass Box so you can re-rank them.",
        argsSchema: z.object({
          focus: z
            .string()
            .optional()
            .describe(
              "Optional: what you want the agent to reconsider (e.g. cost, security)",
            ),
        }),
      },
      ({ focus }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Pause and realign with me using Glass Box. Write out your current task, your full remaining plan step by step, and your own ranked priorities, then call the glassbox \`align\` tool with them. Show me the align_url so I can re-rank. When the contract comes back, replan to match it and tell me what changed.${focus ? ` I especially want you to reconsider: ${focus}.` : ""}`,
            },
          },
        ],
      }),
    );
  },
  { serverInfo: { name: "glass-box", version: "0.2.0" } },
);

const authed = withMcpAuth(
  handler,
  async (req, bearerToken) => {
    if (!bearerToken?.startsWith("gb_")) return undefined;
    try {
      const { userId, agentName, agentKeyId } = await requireAgent(req);
      return {
        token: bearerToken,
        clientId: agentKeyId,
        scopes: [],
        extra: { userId, agentName },
      };
    } catch (error) {
      if (error instanceof HttpError) return undefined;
      throw error;
    }
  },
  { required: true },
);

export { authed as GET, authed as POST, authed as DELETE };

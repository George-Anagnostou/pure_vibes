import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { DecisionSchema } from "@/lib/glassbox/types";
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
// Claude Code abandons an MCP call after ~60s. align returns as soon as the review
// exists (~5s) so the client can open the pop-up; get_contract long-polls up to 40s.
const ALIGN_WAIT_UNTIL_MS = 0;
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
      next: "A pop-up is opening for the human at align_url (if you can't see one opened, show them the link). Call get_contract now — it waits for them to submit. Repeat until approved.",
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
  "Glass Box interview: before you act, show the human how you're approaching the task and the decisions you're about to make on their behalf, so they can correct what you THINK they want. Call this BEFORE acting on any task with real choices (scope, data sources, cost, time, quality, risk), and again when a new significant decision comes up. Give `approach`: 2-4 sentences on how you're thinking about the problem. Then 4-10 `decisions`: the judgment calls you'd otherwise make silently, e.g. 'How many hospitals do I scan? → All 20', 'Where do prices come from? → hospital price-transparency files', 'Proof of concept or full build?'. For each: your choice, what you think the human wants that led to it, how you weighed it, 1-3 real alternatives with trade-offs, your estimate of tokens / dollars / time for your choice, and its source (request / instructions / rules / judgment / assumption). Be candid about guesses. A pop-up opens for the human, who keeps or changes each decision and can add instructions. Then call get_contract until approved. Its `decisions` are binding: do what each `decision` says (especially changed_by_human ones), follow instructions_from_human and plan_guidance, and call `checkpoint` before each consequential action.";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "align",
      {
        title: "Check your approach and decisions with the human (Glass Box)",
        description: ALIGN_DESCRIPTION,
        inputSchema: z.object({
          task: z
            .string()
            .trim()
            .min(1)
            .max(4000)
            .describe("What the human asked you to do, in their words"),
          approach: z
            .string()
            .trim()
            .min(1)
            .max(2000)
            .describe(
              "2-4 sentences: how you're thinking about approaching the problem",
            ),
          decisions: z
            .array(DecisionSchema)
            .min(1)
            .max(12)
            .describe(
              "4-10 judgment calls you're making on the human's behalf",
            ),
          agent_name: z.string().trim().min(1).max(100).optional(),
        }),
      },
      async ({ task, approach, decisions, agent_name }, ctx) => {
        const started = Date.now();
        try {
          const agent = agentFrom(ctx as ToolCtx);
          const review = await createReview({
            userId: agent.userId,
            agentName: agent_name ?? agent.agentName,
            task,
            plan: approach,
            decisions,
          });
          const lookup = await waitForContract(
            review.review_id,
            agent.userId,
            started + ALIGN_WAIT_UNTIL_MS,
          );
          // The analysis is for the human only: the agent sees nothing until they decide.
          return text({
            review_id: review.review_id,
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
          "Ask the agent to show you how it's approaching the task and the decisions it's making for you, so you can correct them.",
        argsSchema: z.object({
          focus: z
            .string()
            .optional()
            .describe(
              "Optional: what you want the agent to reconsider (e.g. where it gets its data, cost)",
            ),
        }),
      },
      ({ focus }) => ({
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: `Pause and check your approach with me using Glass Box. Call the glassbox \`align\` tool with your task, how you're approaching it, and the decisions you're making on my behalf (your choice, what you think I want, the alternatives and trade-offs, and the cost/time of your choice). When my decisions come back, follow them exactly and tell me in one or two lines what changed.${focus ? ` I especially want you to reconsider: ${focus}.` : ""}`,
            },
          },
        ],
      }),
    );
  },
  { serverInfo: { name: "glass-box", version: "0.3.0" } },
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

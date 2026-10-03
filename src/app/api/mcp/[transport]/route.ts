import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { StatedPrioritySchema } from "@/lib/glassbox/types";
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
  "Glass Box planning interview: show the human HOW you will do the task before you do it, like a brief planning mode. Call this BEFORE acting on any task with real choices, data, cost or consequences, and again whenever your approach changes. Break your approach into 5-15 concrete steps in the order you'd do them. For each step say exactly HOW: the method, the data sources/APIs/sites/libraries you'd pull from, the tools you'd use (WebFetch, Bash, file edits…), your honest estimate of model tokens and dollars (tokens plus any paid APIs), why you'd do it this way, and its source (request / instructions / rules / judgment / assumption). Don't describe the output; describe the how. A pop-up opens for the human, who reorders, deletes and adds steps. Then call get_contract: it returns the approved_steps in the human's order. That approved plan is binding: do only those steps, in that order, the way described; never do anything in removed_by_human; treat human-added steps as required; call `checkpoint` before each consequential action.";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "align",
      {
        title: "Show the human how you'll do it (Glass Box)",
        description: ALIGN_DESCRIPTION,
        inputSchema: z.object({
          task: z
            .string()
            .trim()
            .min(1)
            .max(4000)
            .describe("What the human asked you to do, in their words"),
          steps: z
            .array(StatedPrioritySchema)
            .min(1)
            .max(20)
            .describe(
              "Your approach as 5-15 concrete steps, in order, each with how / uses / est_tokens / est_cost_usd / why / source",
            ),
          plan: z
            .string()
            .trim()
            .max(12000)
            .optional()
            .describe("Optional: your overall thinking in a few sentences"),
          agent_name: z.string().trim().min(1).max(100).optional(),
        }),
      },
      async ({ task, steps, plan, agent_name }, ctx) => {
        const started = Date.now();
        try {
          const agent = agentFrom(ctx as ToolCtx);
          const review = await createReview({
            userId: agent.userId,
            agentName: agent_name ?? agent.agentName,
            task,
            plan,
            stated: steps,
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
          "Ask the agent to show you how it plans to do the rest of the task, step by step, so you can reorder, delete or add steps.",
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
              text: `Pause and show me how you'll do the rest of this with Glass Box. Call the glassbox \`align\` tool with your task and your remaining approach as concrete steps (how, data sources and tools, estimated tokens and cost, why). When the approved plan comes back, follow it exactly and tell me in one or two lines what changed.${focus ? ` I especially want you to reconsider: ${focus}.` : ""}`,
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

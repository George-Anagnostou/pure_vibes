import { createMcpHandler } from "mcp-handler";
import {
  ChallengeAnswerSchema,
  DecisionSchema,
  StatedPrioritySchema,
} from "@/lib/glassbox/types";
import { z } from "zod";
import { mcpPreflight, withGlassboxAuth } from "@/lib/glassbox/mcp-auth";
import { runCheckpoint } from "@/lib/glassbox/checkpoint";
import {
  answerChallenges,
  createReview,
  getContract,
  waitForContract,
  type ContractLookup,
} from "@/lib/glassbox/reviews";
import { requestSpend } from "@/lib/glassbox/spend";
import { HttpError } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;
// Claude Code abandons an MCP call after ~60s (and maxDuration is 60s). align returns as
// soon as the review exists (~5s) so the client can open the pop-up; get_contract
// long-polls up to 50s per call. Humans often take minutes, so a pending result tells
// the agent, unmistakably, to call get_contract again.
const GET_CONTRACT_WAIT_MS = 50_000;

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
      next: PENDING_NEXT,
    };
  }
  return {
    status: lookup.status,
    align_url: lookup.align_url,
    next: "The human did not approve this plan. Do not execute it.",
  };
}

// Same wording as the agent kit's Stop hook; keep them in step.
const PENDING_NEXT =
  "The human hasn't answered yet (a pop-up is open for them at align_url; if you can't tell it opened, show them the link once). Call get_contract again now with the same review_id. Do not proceed, do not ask the human to paste anything; keep calling until status is approved or rejected. Humans often take several minutes; that is normal.";

const reviewId = z.uuid().describe("review_id returned by align");

const ALIGN_DESCRIPTION =
  "Glass Box interview: before you act, show the human what you think the task is and how you'll weigh trade-offs, so they can correct you. Call this BEFORE acting on any task with real choices (scope, data, cost, time, quality, risk), and again when your understanding changes. Send: `understanding` (what you think the task is: the goal, what success looks like, what's in and out of scope, in your words); `approach` (2-4 sentences); `priorities`: 4-10 things you're weighing, FORCE-RANKED highest first with no ties, each with why and source (request / instructions / rules / judgment / assumption); and optionally `decisions` you're making on their behalf (choice, what you think they want, alternatives with trade-offs, est tokens/$/time). Glass Box returns a review_id and opens a pop-up for the human. Then call get_contract with that review_id and KEEP calling it (each call waits up to ~50s) until status is approved or rejected: the human may take several minutes, so do not stop, proceed or ask them to paste anything in the meantime. The result is binding: weigh trade-offs in the order of ranked_priorities, never optimize for removed_priorities, do what each decision and situation says, follow instructions_from_human and plan_guidance, and call `checkpoint` before each consequential action.";

// Sent on initialize; clients such as Claude Code put this in the agent's
// context, so agents added with a plain `claude mcp add` (no CLAUDE.md from the
// agent kit) still know when to check in with the human.
const SERVER_INSTRUCTIONS =
  "Glass Box is this MCP server (not a skill); its tools are mcp__glassbox__align and mcp__glassbox__get_contract. If they are deferred, load them directly with ToolSearch select:mcp__glassbox__align,mcp__glassbox__get_contract. Glass Box lets the human check how you're approaching a task before you act. Before acting on any task with real choices (scope, data sources, cost, time, quality, risk), including writing code or scripts that will reach external services, people or their data, call `align` with what you think the task is, your approach, your force-ranked priorities and the decisions you'd otherwise make silently. Then show the human the align_url in one line and call `get_contract` with the review_id, again and again, until status is approved or rejected. The human may take several minutes; each call waits up to ~50s, so just call it again when it says pending. Don't start the work, end your turn or ask the human to paste anything before that. The approved contract is binding: follow ranked_priorities, decisions and instructions_from_human, and tell the human in one or two lines what changed. Call `checkpoint` before spending, deleting, contacting anyone or accessing anything new, and never perform an action it blocks. If a new significant decision comes up, call `align` again. Skip Glass Box only for trivial requests with no real choices: if you would end by telling the human which choices you made for them, align on those choices first instead.";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "align",
      {
        title:
          "Interview: show the human how you understand and will weigh this task (Glass Box)",
        description: ALIGN_DESCRIPTION,
        inputSchema: z.object({
          task: z
            .string()
            .trim()
            .min(1)
            .max(4000)
            .describe("What the human asked you to do, in their words"),
          understanding: z
            .string()
            .trim()
            .min(1)
            .max(2000)
            .describe(
              "What you think the task is: goal, what success looks like, what's in and out of scope",
            ),
          approach: z
            .string()
            .trim()
            .min(1)
            .max(2000)
            .describe(
              "2-4 sentences: how you're thinking about approaching the problem",
            ),
          priorities: z
            .array(StatedPrioritySchema)
            .min(1)
            .max(12)
            .describe(
              "4-10 things you're weighing, force-ranked highest first (no ties), each with why and source",
            ),
          decisions: z
            .array(DecisionSchema)
            .max(12)
            .optional()
            .describe(
              "Optional: judgment calls you're making on the human's behalf",
            ),
          agent_name: z.string().trim().min(1).max(100).optional(),
        }),
      },
      async (
        { task, understanding, approach, priorities, decisions, agent_name },
        ctx,
      ) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          const review = await createReview({
            userId: agent.userId,
            agentName: agent_name ?? agent.agentName,
            task,
            understanding,
            plan: approach,
            priorities,
            decisions,
          });
          // The analysis is for the human only: the agent sees nothing until they decide.
          return text({
            review_id: review.review_id,
            ...contractPayload({
              status: "pending",
              align_url: review.align_url,
            }),
          });
        } catch (error) {
          return toolError(error);
        }
      },
    );

    server.registerTool(
      "answer_challenges",
      {
        title: "Answer Glass Box's challenges (no longer needed)",
        description:
          "Deprecated: align no longer returns challenges, so there is nothing to answer. Kept so older clients don't break; returns the same status as get_contract without waiting. Call get_contract instead.",
        inputSchema: z.object({
          review_id: reviewId,
          answers: z.array(ChallengeAnswerSchema).max(10).optional(),
        }),
      },
      async ({ review_id, answers }, ctx) => {
        try {
          const agent = agentFrom(ctx as ToolCtx);
          await answerChallenges(review_id, agent.userId, answers);
          return text({
            review_id,
            ...contractPayload(await getContract(review_id, agent.userId)),
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
          "Wait (up to ~50s per call) for the human's answer to a review. If status is pending, call get_contract again immediately with the same review_id, and keep calling until it is approved or rejected: the human may take several minutes. Once approved, follow the contract exactly.",
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

    // Shown in Claude Code as /mcp__glassbox__align — the human asks the agent to realign on demand.
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
              text: `Pause and check your approach with me using Glass Box. Call the glassbox \`align\` tool with your task, how you're approaching it, what you think the task is, what you're weighing (force-ranked), and the decisions you're making on my behalf; including for each decision your choice, what you think I want, the alternatives and trade-offs, and the cost/time of your choice. Then keep calling \`get_contract\` until I've answered (it can take me a few minutes). When my decisions come back, follow them exactly and tell me in one or two lines what changed.${focus ? ` I especially want you to reconsider: ${focus}.` : ""}`,
            },
          },
        ],
      }),
    );
  },
  {
    serverInfo: { name: "glass-box", version: "0.3.0" },
    instructions: SERVER_INSTRUCTIONS,
  },
);

// Bearer header or ?key= query, clean 401 + WWW-Authenticate, and open CORS
// for browser-based MCP clients. See src/lib/glassbox/mcp-auth.ts.
const authed = withGlassboxAuth(handler);

export {
  authed as GET,
  authed as POST,
  authed as DELETE,
  mcpPreflight as OPTIONS,
};

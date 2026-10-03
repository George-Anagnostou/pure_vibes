import "server-only";
import { bearerKey, verifyAgentKey } from "@/lib/glassbox/agent-auth";
import { HttpError } from "@/lib/http";

// Auth + CORS wrapper for the Glass Box MCP endpoint (/api/mcp/mcp).
//
// The agent key arrives as `Authorization: Bearer gb_...` or, for MCP clients
// that cannot set headers, as `?key=gb_...` on the URL. The query form works but
// is weaker: URLs end up in request logs, proxy logs and shell history, so the
// header wins whenever both are present and /connect recommends the header.
//
// CORS is open (`*`): auth is a bearer key, never a cookie, so a browser-based
// client (e.g. MCP Inspector in direct mode) gains nothing it could not do anyway.

type Handler = (request: Request) => Promise<Response>;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers":
    "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS))
    headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function mcpPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function unauthorized(message: string): Response {
  const quoted = message.replace(/["\\]/g, "");
  return Response.json(
    { error: "invalid_token", error_description: message },
    {
      status: 401,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
        "WWW-Authenticate": `Bearer realm="glassbox", error="invalid_token", error_description="${quoted}"`,
      },
    },
  );
}

export function agentKeyFrom(request: Request): string | undefined {
  return (
    bearerKey(request) ??
    (new URL(request.url).searchParams.get("key")?.trim() || undefined)
  );
}

export function withGlassboxAuth(handler: Handler): Handler {
  return async (request) => {
    if (request.method === "OPTIONS") return mcpPreflight();
    const key = agentKeyFrom(request);
    if (!key?.startsWith("gb_"))
      return unauthorized(
        "Glass Box needs an agent key. Send `Authorization: Bearer gb_...` (or append ?key=gb_... to the URL). Mint one at /connect.",
      );
    try {
      const agent = await verifyAgentKey(key);
      // mcp-handler passes request.auth to tools as ctx.http.authInfo.
      Object.assign(request, {
        auth: {
          token: key,
          clientId: agent.agentKeyId,
          scopes: [],
          extra: { userId: agent.userId, agentName: agent.agentName },
        },
      });
    } catch (error) {
      if (error instanceof HttpError && error.status === 401)
        return unauthorized(error.message);
      console.error("glassbox_mcp_auth_failed", {
        type: error instanceof Error ? error.name : "Unknown",
      });
      return withCors(
        Response.json(
          {
            error: "server_error",
            error_description: "Glass Box is unavailable. Try again.",
          },
          { status: 503 },
        ),
      );
    }
    return withCors(await handler(request));
  };
}

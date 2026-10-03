import { appUrl } from "@/lib/env";
import { script } from "@/lib/install-script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /install: one-line Glass Box setup for Claude Code.
//
//   curl -fsSL https://APP/install | sh                 # asks for the key
//   curl -fsSL https://APP/install | sh -s -- gb_...    # key given up front
//
// Run it in the project folder. It downloads the agent kit installer (MCP
// server + pop-up hooks + CLAUDE.md section), runs it, and deletes it. Asking
// for the key keeps it out of shell history. Public: contains no secrets.
export function GET() {
  return new Response(script(appUrl()), {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

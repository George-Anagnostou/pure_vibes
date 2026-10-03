import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

// GET /api/agent-kit/:file — the Claude Code agent kit, so anyone can install the
// hooks without cloning the repo (install.mjs fetches its hook files from here).
// Public: these files contain no secrets. Bundled via outputFileTracingIncludes.
const FILES: Record<string, string> = {
  "install.mjs": "install.mjs",
  "CLAUDE.glassbox.md": "CLAUDE.glassbox.md",
  "glassbox-lib.mjs": "hooks/glassbox-lib.mjs",
  "glassbox-context.mjs": "hooks/glassbox-context.mjs",
  "glassbox-guard.mjs": "hooks/glassbox-guard.mjs",
  "glassbox-popup.mjs": "hooks/glassbox-popup.mjs",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const relative = Object.hasOwn(FILES, file) ? FILES[file] : undefined;
  if (!relative)
    return Response.json({ error: "Unknown agent kit file." }, { status: 404 });
  try {
    const body = await readFile(
      join(process.cwd(), "agent-kit", relative),
      "utf8",
    );
    return new Response(body, {
      headers: {
        "Content-Type": file.endsWith(".md")
          ? "text/markdown; charset=utf-8"
          : "text/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    console.error("agent_kit_file_missing", { file });
    return Response.json(
      { error: "Agent kit is unavailable on this deployment." },
      { status: 500 },
    );
  }
}

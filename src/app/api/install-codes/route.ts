import { requireUser } from "@/lib/auth";
import { createInstallCode } from "@/lib/glassbox/install-codes";
import { appUrl } from "@/lib/env";
import { assertSameOrigin, errorResponse, json } from "@/lib/http";

export const runtime = "nodejs";

// POST /api/install-codes: the signed-in human gets a one-time install command.
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user } = await requireUser();
    const { code, expiresAt } = await createInstallCode(user.id);
    const command = `curl -fsSL ${appUrl()}/i/${code} | sh`;
    return json(
      {
        code,
        command,
        claude_prompt: `Set up Glass Box for me: run \`${command}\` in this project folder, then tell me to restart Claude Code.`,
        expires_at: expiresAt.toISOString(),
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

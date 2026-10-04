import { appUrl } from "@/lib/env";
import { redeemInstallCode } from "@/lib/glassbox/install-codes";
import {
  isCommandLineFetch,
  notATerminalScript,
  script,
} from "@/lib/install-script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Always 200: the command uses `curl -f`, which would swallow the message on an error
// status. The script itself exits non-zero when something is wrong.
const sh = (body: string) =>
  new Response(body, {
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

// GET /i/<code>: `curl -fsSL <site>/i/<code> | sh` installs Glass Box in the current
// folder with a freshly minted key. Each code works once, for 15 minutes, and is only
// redeemed by curl/wget/fetch so link previews and browsers can't burn it.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  if (!isCommandLineFetch(request.headers.get("user-agent"))) {
    const safe = /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : "CODE";
    return new Response(notATerminalScript(`${appUrl()}/i/${safe}`), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  }
  let key: string | null = null;
  try {
    key = await redeemInstallCode(code);
  } catch {
    return sh(
      `#!/bin/sh\necho "Glass Box: something went wrong on our side. Try again in a moment." >&2\nexit 1\n`,
    );
  }
  if (!key) {
    // Still a valid script, so `| sh` prints a clear message instead of a parse error.
    return sh(
      `#!/bin/sh\necho "Glass Box: that install code has expired or was already used. Get a new one at ${appUrl()}/connect" >&2\nexit 1\n`,
    );
  }
  return sh(script(appUrl(), key));
}

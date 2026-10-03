import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";

const NO_STORE = { headers: { "Cache-Control": "private, no-store" } };

// Accepts both PKCE (?code=) and token-hash (?token_hash=&type=) sign-in links.
// ?next=/inbox returns the human to where they were (same-origin paths only).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const next = params.get("next");
  const target = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const supabase = await createClient();

  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("missing code") };

  return NextResponse.redirect(
    error ? `${appUrl()}/?auth=error` : `${appUrl()}${target}`,
    NO_STORE,
  );
}

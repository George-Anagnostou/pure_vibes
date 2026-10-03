import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl, trustedOrigins } from "@/lib/env";
import { AUTH_NEXT_COOKIE, safeNextPath } from "@/lib/auth-navigation";

const PRIVATE = {
  headers: {
    "Cache-Control": "private, no-store",
    "Referrer-Policy": "no-referrer",
  },
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = trustedOrigins().has(url.origin) ? url.origin : appUrl();
  const cookieStore = await cookies();
  const next = safeNextPath(
    url.searchParams.get("next") ?? cookieStore.get(AUTH_NEXT_COOKIE)?.value,
  );
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  // Email scanners can follow GET links. Consume the token only after a person
  // presses Continue on the confirmation page (same-origin POST).
  if (tokenHash && ["email", "signup", "magiclink"].includes(type ?? "")) {
    const confirm = new URL("/auth/confirm", origin);
    confirm.searchParams.set("token_hash", tokenHash);
    confirm.searchParams.set("type", type!);
    confirm.searchParams.set("next", next);
    return NextResponse.redirect(confirm, PRIVATE);
  }
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(next, origin), PRIVATE);
      response.cookies.delete(AUTH_NEXT_COOKIE);
      return response;
    }
  }
  const retry = new URL("/sign-in", origin);
  retry.searchParams.set("error", "link");
  retry.searchParams.set("next", next);
  return NextResponse.redirect(retry, PRIVATE);
}

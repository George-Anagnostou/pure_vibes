import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  readJson,
} from "@/lib/http";
import { AUTH_NEXT_COOKIE, safeNextPath } from "@/lib/auth-navigation";
import { NextResponse } from "next/server";

const EMAIL_LIMIT_MESSAGE =
  "We've hit our email limit for now. Try again in a little while, or if you already got an email, use the sign-in code in it.";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email, next } = await readJson(
      request,
      z.object({
        email: z.email().max(254),
        next: z.string().max(2048).optional(),
      }),
    );
    const origin = request.headers.get("origin")!;
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${origin}/auth/callback` },
    });
    if (error) {
      console.error("auth_email_failed", {
        code: error.code,
        status: error.status,
      });
      // 429 is usually Supabase's project-wide email cap (the built-in sender allows
      // only a few emails per hour), not this user retrying too fast.
      throw new HttpError(
        error.status === 429 ? 429 : 503,
        error.status === 429
          ? EMAIL_LIMIT_MESSAGE
          : "We couldn't send your sign-in email. Try again shortly.",
      );
    }
    const response = NextResponse.json(
      {
        message:
          "Check your email and open the newest sign-in link in this browser. If the email includes a code, you can enter it below.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    response.cookies.set(AUTH_NEXT_COOKIE, safeNextPath(next), {
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https:"),
      path: "/",
      maxAge: 3600,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

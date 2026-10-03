import { z } from "zod";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  readJson,
} from "@/lib/http";
import { AUTH_NEXT_COOKIE, safeNextPath } from "@/lib/auth-navigation";

const input = z.union([
  z.object({
    email: z.email().max(254),
    token: z.string().regex(/^\d{6,10}$/, "Enter the code from your email."),
    next: z.string().max(2048).optional(),
  }),
  z.object({
    token_hash: z.string().min(1).max(1024),
    type: z.enum(["email", "signup", "magiclink"]),
    next: z.string().max(2048).optional(),
  }),
]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = await readJson(request, input);
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp(
      "token_hash" in body
        ? { token_hash: body.token_hash, type: body.type }
        : { email: body.email, token: body.token, type: "email" },
    );
    if (error)
      throw new HttpError(
        error.status === 429 ? 429 : 400,
        error.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "That code or link has expired or was already used. Request a new email and use the newest one.",
      );
    const cookieStore = await cookies();
    const next = safeNextPath(
      body.next ?? cookieStore.get(AUTH_NEXT_COOKIE)?.value,
    );
    const response = NextResponse.json(
      { next },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    response.cookies.delete(AUTH_NEXT_COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}

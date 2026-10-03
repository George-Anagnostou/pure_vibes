import { z } from "zod";
import { appUrl } from "@/lib/env";
import {
  assertSameOrigin,
  errorResponse,
  HttpError,
  json,
  readJson,
} from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { email } = await readJson(
      request,
      z.object({ email: z.email().max(254) }),
    );
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${appUrl()}/auth/callback` },
    });
    if (error)
      throw new HttpError(
        429,
        "Could not send a sign-in link. Check your email and wait a minute before retrying.",
      );
    return json({
      message: "Check your email. Open the sign-in link in this browser.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

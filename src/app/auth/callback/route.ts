import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/env";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error)
      return NextResponse.redirect(`${appUrl()}/`, {
        headers: { "Cache-Control": "private, no-store" },
      });
  }
  return NextResponse.redirect(`${appUrl()}/?auth=error`, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { HttpError } from "@/lib/http";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Sign in to continue.");
  return { user: data.user, supabase };
}

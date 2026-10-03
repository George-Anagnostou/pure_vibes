// Production is reachable at several hosts (APP_URL, the team alias, one URL per
// deployment). Sign-in links only return to hosts on Supabase's redirect
// allowlist, and the PKCE verifier cookie lives on the host that asked for the
// email, so a person who starts on a non-canonical host can never finish
// signing in. Send page visits to APP_URL before they start.
//
// Not redirected: non-production builds (previews keep their own host), API
// routes (agents and MCP clients keep working at any host), and /auth/* (links
// already in flight must finish on the host that holds their verifier).
export function canonicalRedirectUrl(
  request: { method: string; url: string; headers: Headers },
  env: Partial<Record<"VERCEL_ENV" | "APP_URL", string>> = {
    VERCEL_ENV: process.env.VERCEL_ENV,
    APP_URL: process.env.APP_URL,
  },
): URL | null {
  if (env.VERCEL_ENV !== "production") return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  let canonical: URL;
  try {
    canonical = new URL(env.APP_URL?.trim() ?? "");
  } catch {
    return null;
  }
  if (canonical.protocol !== "https:") return null;
  const current = new URL(request.url);
  // The host the visitor typed: request.url can carry the server's own host.
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    current.host
  )
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (host === canonical.host) return null;
  if (
    current.pathname.startsWith("/api/") ||
    current.pathname.startsWith("/auth/")
  )
    return null;
  return new URL(`${current.pathname}${current.search}`, canonical.origin);
}

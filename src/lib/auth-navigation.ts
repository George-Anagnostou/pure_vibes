// Only internal paths may be used after authentication.
export function safeNextPath(value: unknown, fallback = "/account"): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return fallback;
  try {
    const url = new URL(value, "https://glassbox.invalid");
    if (
      url.origin !== "https://glassbox.invalid" ||
      url.pathname.startsWith("/auth/") ||
      url.pathname === "/sign-in"
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
export const AUTH_NEXT_COOKIE = "glassbox-auth-next";

import { ConfirmSignIn } from "./confirm-sign-in";
import { safeNextPath } from "@/lib/auth-navigation";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Confirm sign-in · Glass Box",
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-3xl font-black">Finish signing in</h1>
      <p className="mt-3 text-ink-soft">
        Continue to securely sign in to Glass Box using the email link you
        requested.
      </p>
      <ConfirmSignIn
        tokenHash={
          typeof params.token_hash === "string" ? params.token_hash : ""
        }
        type={typeof params.type === "string" ? params.type : "email"}
        next={safeNextPath(params.next)}
      />
    </main>
  );
}

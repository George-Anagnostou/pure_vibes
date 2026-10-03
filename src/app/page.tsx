import Link from "next/link";
import { redirect } from "next/navigation";
import { ResumeAfterSignIn, SignOutButton } from "@/components/session-actions";
import { SignInForm } from "@/components/sign-in-form";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function currentEmail(): Promise<{
  email: string | null;
  failed: boolean;
}> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return { email: null, failed: true };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    const failed = Boolean(error && error.name !== "AuthSessionMissingError");
    return { email: data.user?.email ?? null, failed };
  } catch {
    return { email: null, failed: true };
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (params.billing === "success" || params.billing === "cancelled")
    redirect(`/account?billing=${params.billing}`);
  const { email, failed } = await currentEmail();

  return (
    <main className="mx-auto max-w-lg px-4 pt-12 pb-16">
      <h1 className="text-3xl leading-tight font-black tracking-tight sm:text-4xl">
        Before your agent acts, it checks what you actually care about.
      </h1>
      <p className="mt-3 text-lg text-ink-soft">
        Your agent shares its priorities. You put them in order. It follows your
        order.
      </p>

      {params.auth === "error" && (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-stop-bg p-4 font-semibold text-stop"
        >
          That sign-in link could not be verified. Request another and open it
          in this browser.
        </p>
      )}
      {failed && (
        <p
          role="alert"
          className="mt-6 rounded-xl bg-warn-bg p-4 font-semibold text-warn"
        >
          Can&apos;t reach the server right now. Refresh in a moment.
        </p>
      )}

      <section className="mt-8">
        {email ? (
          <>
            <ResumeAfterSignIn />
            <Link
              href="/inbox"
              className="block rounded-xl bg-ink px-5 py-4 text-center text-lg font-bold text-white hover:bg-ink/85"
            >
              Open your inbox
            </Link>
            <Link
              href="/connect"
              className="mt-3 block rounded-xl border-2 border-ink px-5 py-3 text-center font-bold hover:bg-card"
            >
              Connect an agent
            </Link>
            <p className="mt-3 text-center text-sm text-ink-soft">
              Signed in as {email} · <SignOutButton />
            </p>
          </>
        ) : (
          <>
            <SignInForm nextPath="/connect" />
            <p className="mt-3 text-sm text-ink-soft">
              New here? Sign in with your email, then{" "}
              <Link href="/connect" className="font-semibold underline">
                connect your agent
              </Link>{" "}
              (Claude Code, Cursor or any MCP client).
            </p>
          </>
        )}
      </section>
    </main>
  );
}

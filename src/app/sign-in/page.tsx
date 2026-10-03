import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/auth-navigation";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Sign in · Glass Box",
  referrer: "no-referrer" as const,
};
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-3xl font-black tracking-tight">
        Your Glass Box account
      </h1>
      <p className="mt-2 text-ink-soft">
        Sign in or create an account with your email. No password needed.
      </p>
      {params.error && (
        <p role="alert" className="mt-5 rounded-xl bg-warn-bg p-4 text-warn">
          That sign-in link couldn&apos;t be verified. Enter the code from your
          latest email below, or request a new email. Older links may have
          expired or already been used.
        </p>
      )}
      <div className="mt-6">
        <SignInForm nextPath={next} allowExistingCode={Boolean(params.error)} />
      </div>
      <Link href="/" className="mt-6 inline-block text-sm underline">
        Back to Glass Box
      </Link>
    </main>
  );
}

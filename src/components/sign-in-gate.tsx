import { SignInForm } from "@/components/sign-in-form";

export function SignInGate({
  nextPath,
  title = "Sign in to continue",
  body,
}: {
  nextPath: string;
  title?: string;
  body?: string;
}) {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-black tracking-tight">{title}</h1>
        {body && <p className="mt-2 text-ink-soft">{body}</p>}
        <div className="mt-5">
          <SignInForm nextPath={nextPath} />
        </div>
      </div>
    </main>
  );
}

export function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-lg px-4 py-10">
      <div
        role="alert"
        className="rounded-2xl border border-stop bg-stop-bg p-6 text-stop"
      >
        <h1 className="text-xl font-black">{title}</h1>
        <p className="mt-2 font-medium">{body}</p>
      </div>
    </main>
  );
}

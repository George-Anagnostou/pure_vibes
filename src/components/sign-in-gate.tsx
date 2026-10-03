import { SignInForm } from "@/components/sign-in-form";
import styles from "@/components/glassbox/glassbox.module.css";

// Rendered inside <Shell>; pages provide the frosted-sky wrapper.
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
    <main className={styles.onboardShell}>
      <h1 className={`${styles.taskHeader} ${styles.pretty}`}>{title}</h1>
      {body && <p className={styles.agentName}>{body}</p>}
      <div className={styles.onboardCard}>
        <SignInForm nextPath={nextPath} />
      </div>
    </main>
  );
}

export function ErrorCard({ title, body }: { title: string; body: string }) {
  return (
    <main className={styles.onboardShell}>
      <div role="alert" className={styles.alertCard} style={{ marginTop: 24 }}>
        <strong>{title}</strong>
        <p style={{ margin: "4px 0 0" }}>{body}</p>
      </div>
    </main>
  );
}

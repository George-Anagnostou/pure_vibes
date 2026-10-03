import type { Metadata } from "next";
import Link from "next/link";
import styles from "@/components/glassbox/glassbox.module.css";
import { Shell } from "@/components/glassbox/shell";

export const metadata: Metadata = { title: "Page not found · Glass Box" };

export default function NotFound() {
  return (
    <Shell>
      <main className={styles.connectStack}>
        <h1
          className={`${styles.taskHeader} ${styles.pretty}`}
          style={{ marginTop: 28 }}
        >
          We couldn&apos;t find that page.
        </h1>
        <p className={styles.cardHint}>
          The link may be old, or the review may belong to another account.
        </p>
        <p style={{ textAlign: "center", marginTop: 16 }}>
          <Link href="/" className={styles.btnDark}>
            Go home
          </Link>
        </p>
      </main>
    </Shell>
  );
}

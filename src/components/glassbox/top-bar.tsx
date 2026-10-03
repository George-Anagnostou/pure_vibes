import Image from "next/image";
import Link from "next/link";
import styles from "./glassbox.module.css";

// Frosted app bar from the Figma desktop frame (node 5:2031):
// Profile : Account on the left, wordmark centered (links home),
// Connect on the right.

export function TopBar({ minimal = false }: { minimal?: boolean }) {
  return (
    <header className={styles.topBar}>
      <span className={styles.topBarSide}>
        {!minimal && (
          <Link href="/profile" className={styles.topBarLink}>
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="10" r="3.2" />
              <path d="M5.5 19.2c1.6-3.1 4.3-4.2 6.5-4.2s4.9 1.1 6.5 4.2" />
            </svg>
            Profile : Account
          </Link>
        )}
      </span>
      <Link href="/" aria-label="Glass Box home">
        <Image
          src="/logo.svg"
          alt="Glass Box"
          width={140}
          height={16}
          priority
          className={styles.topBarLogo}
        />
      </Link>
      <span className={`${styles.topBarSide} ${styles.topBarSideEnd}`}>
        {!minimal && (
          <Link href="/connect" className={styles.topBarLink}>
            Connect
          </Link>
        )}
      </span>
    </header>
  );
}

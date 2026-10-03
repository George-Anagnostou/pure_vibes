import styles from "./glassbox.module.css";
import { glassboxFonts } from "./fonts";
import { TopBar } from "./top-bar";

// Frosted-sky page wrapper: every route renders inside this so the whole
// product shares one surface (DESIGN.md).
export function Shell({
  children,
  minimal = false,
}: {
  children: React.ReactNode;
  minimal?: boolean;
}) {
  return (
    <div className={`${styles.page} ${glassboxFonts}`}>
      <TopBar minimal={minimal} />
      {children}
    </div>
  );
}

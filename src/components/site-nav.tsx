"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The agent's pop-up (/align/[id]) uses Glass Box's own frosted TopBar instead.
export function SiteNav() {
  const pathname = usePathname();
  if (pathname?.startsWith("/align/")) return null;
  return (
    <header className="border-b border-line bg-card">
      <nav className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-2.5">
        <Link
          href="/"
          className="mr-auto flex items-center gap-2 text-lg font-black tracking-tight"
        >
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-md border-2 border-ink bg-paper text-[11px] leading-none"
          >
            GB
          </span>
          Glass Box
        </Link>
        <NavLink href="/inbox">Inbox</NavLink>
        <NavLink href="/connect">Connect</NavLink>
        <NavLink href="/account">Account</NavLink>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-paper hover:text-ink"
    >
      {children}
    </Link>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glass Box",
  description:
    "Guardrails tell an agent what it can't do. Glass Box tells it what you actually care about.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

// Pages wrap themselves in the glassbox <Shell> (frosted TopBar + sky),
// so the layout stays bare.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

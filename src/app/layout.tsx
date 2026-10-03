import type { Metadata, Viewport } from "next";
import { SiteNav } from "@/components/site-nav";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}

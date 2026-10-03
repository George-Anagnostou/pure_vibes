import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glass Box",
  description:
    "See how your AI really works. Your agent shares its plan, you set the priorities, it follows them.",
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

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GlassBox",
  description:
    "Make AI agent work visible, understandable, and easier for people to guide.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

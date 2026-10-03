import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pure Vibes · Starter",
  description:
    "A TypeScript integration starter for the Pure Vibes hackathon team.",
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

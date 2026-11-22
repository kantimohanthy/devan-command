import type { Metadata } from "next";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/major-mono-display";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEVAN",
  description: "Private command center.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

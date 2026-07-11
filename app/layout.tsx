import type { Metadata } from "next";
import "./globals.css";

// Base URL so the auto-generated opengraph-image / twitter-image tags resolve to
// absolute URLs (social crawlers reject relative image paths). Falls back to the
// Vercel deployment URL, then localhost for dev.
const siteUrl =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Bball Court Fee",
  description: "Court Fee will be shared with participants",
  openGraph: {
    title: "Bball Court Fee",
    description: "Court Fee will be shared with participants",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bball Court Fee",
    description: "Court Fee will be shared with participants",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

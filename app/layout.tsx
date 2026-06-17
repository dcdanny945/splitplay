import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SplitPlay",
  description: "Register for events and split the cost automatically.",
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

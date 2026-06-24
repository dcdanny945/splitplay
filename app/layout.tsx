import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bball Court Fee",
  description: "Court Fee will be shared with participants",
  openGraph: {
    title: "Bball Court Fee",
    description: "Court Fee will be shared with participants",
    type: "website",
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

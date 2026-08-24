import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Ops Platform",
  description:
    "Autonomous AI content operations platform — research, strategize, write, validate, illustrate, and publish with human control.",
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

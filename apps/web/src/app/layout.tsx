import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "AccessFlow",
  description: "Workflow case study foundation for clinical study access requests."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

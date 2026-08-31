import type { Metadata } from "next";

import { SkipLink } from "@/components/ui/skip-link";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "TransitOps",
    template: "%s | TransitOps",
  },
  description: "Rule-driven transport operations for reliable fleet dispatch.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SkipLink />
        {children}
      </body>
    </html>
  );
}

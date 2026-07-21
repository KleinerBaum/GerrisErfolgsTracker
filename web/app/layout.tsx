import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Gerri Life OS · Portfolio Dashboard",
  description:
    "Mobile-first Self-Management, Daily Reports und nachvollziehbare Automation mit ChatGPT Apps.",
  applicationName: "Gerri Life OS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8f7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1110" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de-DE">
      <body>{children}</body>
    </html>
  );
}

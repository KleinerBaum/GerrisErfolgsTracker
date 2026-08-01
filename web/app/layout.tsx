import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";

const title = "Gerris Kompass · Deine Zentrale";
const description =
  "Aufgaben, Kalender, Finanzen, Bewerbungen und Tagebuch im Blick – gemeinsam priorisiert, mit persönlichen KPI-Zielen und klaren nächsten Schritten.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = `${protocol}://${host}`;

  return {
    title,
    description,
    applicationName: "Gerris Kompass",
    metadataBase: new URL(baseUrl),
    icons: {
      icon: [{ url: "/icon.png", type: "image/png", sizes: "512x512" }],
      shortcut: "/favicon.ico",
      apple: [
        { url: "/apple-icon.png", type: "image/png", sizes: "180x180" },
      ],
    },
    robots: { index: false, follow: false },
    manifest: "/manifest.webmanifest",
    openGraph: {
      title,
      description,
      type: "website",
      url: baseUrl,
      images: [
        {
          url: `${baseUrl}/og-zentrale.png`,
          width: 1729,
          height: 910,
          alt: "Gerris Kompass – deine Zentrale für klar priorisierte nächste Schritte",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/og-zentrale.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1512" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="de-DE">
      <body>{children}</body>
    </html>
  );
}

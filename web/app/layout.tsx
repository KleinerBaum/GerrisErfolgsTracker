import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";

const title = "Gerris Kompass · Ein klarer nächster Schritt";
const description =
  "Aufgaben, Termine, Finanzen, Bewerbungen und Tagebuch im Blick – mit einem gemeinsamen Fortschritt und deiner passenden Belohnungswelt.";

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
          url: `${baseUrl}/og-kompass.png`,
          width: 1659,
          height: 948,
          alt: "Gerris Kompass – ein Fortschritt und deine passende Belohnungswelt",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/og-kompass.png`],
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

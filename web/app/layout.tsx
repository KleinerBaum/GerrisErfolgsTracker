import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";

const title = "Gerris Kompass · Momentum Realm";
const description =
  "Aufgaben, Termine, Finanzen, Bewerbungen und Tagebuch im Blick – mit transparenten Klarpunkten, lebender Chronik und adaptivem Fortschritt.";

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
    robots: { index: false, follow: false },
    manifest: "/manifest.webmanifest",
    openGraph: {
      title,
      description,
      type: "website",
      url: baseUrl,
      images: [
        {
          url: `${baseUrl}/og-momentum.png`,
          width: 1659,
          height: 948,
          alt: "Gerris Kompass – Momentum Realm mit Klarpunkten, lebender Chronik und adaptiver Belohnungswelt",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/og-momentum.png`],
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

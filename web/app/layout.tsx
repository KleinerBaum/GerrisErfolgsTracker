import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";

import "./globals.css";

const title = "Gerris Kompass · Heute im Blick";
const description =
  "Privater Überblick über Ziele, Termine, Finanzen, Unterlagen, Bewerbungen und Reflexion.";

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
          url: `${baseUrl}/og-core-kpis.png`,
          width: 1731,
          height: 909,
          alt: "Gerris Kompass – Ziele, Termine, Finanzen, Unterlagen, Bewerbungen und Reflexion im Blick",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${baseUrl}/og-core-kpis.png`],
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

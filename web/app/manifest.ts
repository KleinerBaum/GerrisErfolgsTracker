import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gerris Kompass",
    short_name: "Kompass",
    description: "Privater Kompass für Aufgaben, Termine und nächste Schritte.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f5f0",
    theme_color: "#0f765d",
    lang: "de",
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gerris Kompass",
    short_name: "Kompass",
    description:
      "Privates Selbstmanagement für Aufgaben, Termine, Kosten und Unterlagen.",
    start_url: "/",
    display: "standalone",
    background_color: "#f2f5f0",
    theme_color: "#0f765d",
    lang: "de",
  };
}

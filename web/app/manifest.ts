import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gerri Life OS",
    short_name: "Life OS",
    description: "Mobile-first Self-Management und nachvollziehbare Automation.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f8f7",
    theme_color: "#0f766e",
    lang: "de-DE",
  };
}

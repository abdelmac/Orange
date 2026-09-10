import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Orange — Gestion financière",
    short_name: "Orange",
    description: "Gestion financière et commerciale de votre entreprise",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8f9fb",
    theme_color: "#e96532",
    lang: "fr",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

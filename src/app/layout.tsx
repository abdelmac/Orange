import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Orange · Gestion d’entreprise", template: "%s · Orange" },
  description: "Votre activité, vos équipes et votre trésorerie, au même endroit.",
  applicationName: "Orange Finance",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Orange" },
  icons: {
    icon: "/icon.svg",
    apple: { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f8f9fb" };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" dir="ltr">
      <body>{children}</body>
    </html>
  );
}

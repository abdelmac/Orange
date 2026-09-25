import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_COLORS, themeInitializationScript } from "@/lib/theme";
import "./globals.css";
import "./themes.css";
import "./mobile-navigation.css";

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
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" dir="ltr" suppressHydrationWarning>
      <head>
        {/* Keep this preference-owned value outside route-generated metadata. */}
        <meta name="theme-color" content={THEME_COLORS.light} suppressHydrationWarning />
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Relance — Ne postulez plus dans le vide", template: "%s · Relance" },
  description:
    "Analysez vos candidatures, identifiez les bonnes personnes dans chaque entreprise et sachez quoi faire chaque jour.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1513" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lire le nonce rend chaque page dynamique : indispensable pour qu'il figure dans ses scripts.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ThemeProvider nonce={nonce} attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <a
            href="#contenu"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2"
          >
            Aller au contenu
          </a>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

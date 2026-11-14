import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
// La CSP (avec nonce par requête) est posée par le middleware : src/lib/security/csp.ts
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // CV jusqu'à 5 Mo envoyés par Server Action
  experimental: { serverActions: { bodySizeLimit: "6mb" } },
  // Bibliothèques de lecture PDF/DOCX chargées côté serveur sans bundling
  serverExternalPackages: ["unpdf", "mammoth"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

/** Politique de sécurité du contenu, avec nonce par requête pour les scripts. */
export function buildCsp(nonce: string, opts: { isProd: boolean; supabaseUrl: string }): string {
  const supabaseOrigin = safeOrigin(opts.supabaseUrl);
  const supabaseWs = supabaseOrigin.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    // 'strict-dynamic' : seuls les scripts portant le nonce (et ceux qu'ils chargent) s'exécutent.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.isProd ? "" : " 'unsafe-eval'"}`,
    // Styles en ligne nécessaires aux composants (positionnement des menus) ; pas de risque d'exécution.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseOrigin} ${supabaseWs}`.trim(),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    `form-action 'self' https://accounts.google.com https://checkout.stripe.com ${supabaseOrigin}`.trim(),
    "object-src 'none'",
    opts.isProd ? "upgrade-insecure-requests" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function safeOrigin(url: string): string {
  try {
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
}

export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

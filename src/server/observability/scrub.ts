/**
 * Nettoyage des événements d'erreur avant envoi à Sentry : aucune donnée personnelle,
 * aucun contenu de CV ou de message, aucun jeton.
 */
type Ev = {
  request?: { data?: unknown; cookies?: unknown; headers?: Record<string, string>; query_string?: unknown; url?: string };
  user?: unknown;
  extra?: Record<string, unknown>;
  breadcrumbs?: unknown[];
  message?: string;
  exception?: { values?: { value?: string }[] };
};

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const TOKEN = /\b(sk|rk|pk|whsec|sb_secret|sb_publishable|sk-ant)[-_][A-Za-z0-9_-]{8,}/g;
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

export function redact(text: string): string {
  return text.replace(EMAIL, "[email]").replace(TOKEN, "[secret]").replace(JWT, "[jwt]");
}

export function scrubEvent<T extends Ev>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
    if (event.request.headers) {
      const keep = ["user-agent", "content-type", "accept-language"];
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([k]) => keep.includes(k.toLowerCase())),
      );
    }
  }
  delete event.user;
  delete event.extra;
  delete event.breadcrumbs;
  if (event.message) event.message = redact(event.message);
  for (const v of event.exception?.values ?? []) if (v.value) v.value = redact(v.value);
  return event;
}

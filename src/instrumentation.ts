import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/server/observability/scrub";

/**
 * Suivi des erreurs serveur (Sentry, région UE recommandée). Désactivé sans SENTRY_DSN.
 * Aucune donnée personnelle : chaque événement est nettoyé avant envoi.
 */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: () => null,
  });
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!process.env.SENTRY_DSN) return;
  return Sentry.captureRequestError(...args);
};

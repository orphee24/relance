/**
 * Contrôles appliqués à tout message, qu'il vienne d'un modèle, de l'IA ou de l'utilisateur.
 * Fonctions pures : exécutées côté serveur à la génération et côté navigateur pendant l'édition.
 */

export type MessageFormat = "note" | "message" | "email";

export const MAX_LENGTH: Record<MessageFormat, number> = { note: 600, message: 1200, email: 1200 };

export interface CheckContext {
  format: MessageFormat;
  /** Un échange réel est enregistré (réponse, appel, rencontre). */
  hadExchange: boolean;
  /** Une connexion commune est enregistrée. */
  hasMutual: boolean;
  /** Une école commune est enregistrée. */
  isAlumni: boolean;
}

export interface CheckIssue {
  code: "empty" | "too_long" | "no_ask" | "invented_exchange" | "invented_mutual" | "invented_alumni" | "placeholder";
  severity: "error" | "warning";
  message: string;
}

const ASK_RE = /\?|\b(pourriez|accepteriez|seriez|auriez|serait-il|est-il possible|me permettrait|n'h[ée]sitez pas)\b/i;
const EXCHANGE_RE =
  /\b(comme (nous en avons|on en a) parl[ée]|comme convenu|suite [àa] notre (échange|echange|conversation|appel|rencontre|entretien)|merci (encore )?pour (notre|cet|cette) (échange|echange|appel|conversation|rencontre)|ravie? (de|d'avoir) (vous avoir |)(rencontr[ée]|parl[ée]|[ée]chang[ée]))/i;
const MUTUAL_RE = /\b(notre (ami|amie|contact|connaissance) commun(e)?|connexion (en )?commun(e)?|de la part de|m'a (conseill[ée]|recommand[ée]) de vous)\b/i;
const ALUMNI_RE = /\b(m[êe]me [ée]cole|ancien(ne)?s? [ée]l[èe]ves?|alumni|promotion commune)\b/i;
const PLACEHOLDER_RE = /\[[^\]]{1,40}\]|\{\{|\}\}|\bXXX\b|<[A-ZÉ_ ]{3,}>/;

export function checkMessage(body: string, ctx: CheckContext): CheckIssue[] {
  const text = body.trim();
  const issues: CheckIssue[] = [];
  if (!text) return [{ code: "empty", severity: "error", message: "Le message est vide." }];
  const max = MAX_LENGTH[ctx.format];
  if (text.length > max) {
    issues.push({ code: "too_long", severity: "error", message: `Le message dépasse ${max} caractères (${text.length}). Raccourcissez-le.` });
  }
  if (!ASK_RE.test(text)) {
    issues.push({ code: "no_ask", severity: "warning", message: "Aucune demande claire : terminez par une question simple." });
  }
  if (!ctx.hadExchange && EXCHANGE_RE.test(text)) {
    issues.push({ code: "invented_exchange", severity: "error", message: "Le message évoque un échange passé qui n'est pas enregistré. Retirez cette formule." });
  }
  if (!ctx.hasMutual && MUTUAL_RE.test(text)) {
    issues.push({ code: "invented_mutual", severity: "error", message: "Le message évoque une connexion commune qui n'est pas enregistrée." });
  }
  if (!ctx.isAlumni && ALUMNI_RE.test(text)) {
    issues.push({ code: "invented_alumni", severity: "error", message: "Le message évoque une école commune qui n'est pas enregistrée." });
  }
  if (PLACEHOLDER_RE.test(text)) {
    issues.push({ code: "placeholder", severity: "error", message: "Un champ à compléter est resté dans le texte (crochets ou accolades)." });
  }
  return issues;
}

export const hasBlockingIssue = (issues: CheckIssue[]) => issues.some((i) => i.severity === "error");

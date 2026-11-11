/**
 * Protection contre les injections de consignes contenues dans un CV ou une offre.
 * 1. Les lignes qui ressemblent à des instructions adressées à une IA sont retirées
 *    du texte transmis au modèle et signalées à l'utilisateur.
 * 2. Le texte restant est encapsulé et déclaré comme donnée non fiable.
 * 3. Les sorties sont validées par schéma puis « ancrées » (grounding.ts).
 */

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|system)\b.{0,30}\b(instructions?|prompts?|rules?|messages?)\b/i,
  /\b(ignore[zr]?|oublie[zr]?|ne tiens? pas compte)\b.{0,40}\b(instructions?|consignes?|r[eè]gles?|messages?)\b.{0,30}\b(pr[ée]c[ée]dent|ci-dessus|syst[eè]me)/i,
  /\b(system prompt|prompt syst[eè]me|developer message)\b/i,
  /\byou are (now )?(an?|the) (ai|assistant|model|chatbot|language model)\b/i,
  /\btu es (maintenant )?(une? )?(ia|assistant|mod[eè]le)\b/i,
  /^\s*(system|assistant|user|human)\s*:/i,
  /<\/?(system|instructions?|untrusted_document)[^>]*>/i,
  /\b(set|mark)\b.{0,30}\b(confidence|score|verified)\b/i,
  /\b(rate|score|rank) (this|the) (candidate|cv|resume)\b.{0,30}\b(highest|10\/10|100)/i,
  /\b(attribue|mets|donne)\b.{0,30}\b(score|note)\b.{0,20}\b(maximal|maximum|100|10\/10)/i,
];

export function isSuspiciousLine(line: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(line));
}

export function stripInjections(text: string): { clean: string; removed: string[] } {
  const removed: string[] = [];
  const kept = text.split("\n").filter((line) => {
    if (isSuspiciousLine(line)) {
      removed.push(line.trim().slice(0, 300));
      return false;
    }
    return true;
  });
  return { clean: kept.join("\n"), removed };
}

/** Encapsule un contenu non fiable pour le prompt (les balises internes sont neutralisées). */
export function wrapUntrusted(label: string, content: string): string {
  const neutralized = content.replace(/<\/?untrusted_document[^>]*>/gi, "");
  return `<untrusted_document type="${label}">\n${neutralized}\n</untrusted_document>`;
}

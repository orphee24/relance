import { createHash } from "node:crypto";
import type { Suggestion } from "@/lib/validation/offer";
import type { ResumeProfile } from "@/lib/validation/resume-profile";
import { normalizeForMatch } from "@/server/cv/grounding";
import { originalWording, type MatchDetail } from "./matcher";

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase("fr-FR") + s.slice(1);

const id = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 16);

/**
 * Suggestions d'amélioration, toutes vérifiables :
 * - add_skill_from_resume : le CV démontre déjà l'élément (réalisation, intitulé) mais pas dans la liste des compétences ;
 * - declare_if_true : critère non démontré ; l'utilisateur peut l'ajouter uniquement s'il le possède, avec sa propre justification ;
 * - information : constat sans modification possible (durée d'expérience, diplôme…).
 * Aucune suggestion n'ajoute d'élément sans preuve dans le CV ou déclaration explicite de l'utilisateur.
 */
export function buildSuggestions(matches: MatchDetail[], profile: ResumeProfile): Suggestion[] {
  const skillNames = new Set(profile.skills.map((s) => normalizeForMatch(s.name)));
  const out: Suggestion[] = [];

  for (const m of matches) {
    for (const t of m.matchedTerms) {
      if (t.origin === "skill" || t.origin === "language" || t.origin === "education") continue;
      if (skillNames.has(normalizeForMatch(t.asWritten))) continue;
      skillNames.add(normalizeForMatch(t.asWritten));
      const skill = capitalize(t.asWritten);
      out.push({
        id: id("add", m.label, t.term),
        type: "add_skill_from_resume",
        requirementLabel: m.label,
        title: `Ajouter « ${skill} » à vos compétences`,
        detail: `Votre CV le montre déjà dans une ${t.origin === "achievement" ? "réalisation" : "expérience"}, mais pas dans la liste des compétences, que les recruteurs et les logiciels de tri parcourent en premier.`,
        skillName: skill,
        resumeEvidence: t.line,
        status: "pending",
        userNote: null,
      });
    }

    const notDemonstrated = m.coverage === "missing" || (m.coverage === "partial" && m.missingTerms.length > 0);
    if (!notDemonstrated) continue;

    if (["skill", "tool", "certification"].includes(m.category)) {
      const what = m.missingTerms.length ? m.missingTerms.map((t) => originalWording(m.label, t)).join(", ") : m.label;
      out.push({
        id: id("declare", m.label),
        type: "declare_if_true",
        requirementLabel: m.label,
        title: m.kind === "mandatory" ? `Critère obligatoire non démontré : ${what}` : `Critère souhaité non démontré : ${what}`,
        detail:
          "Votre CV vérifié ne le mentionne pas. Si vous possédez réellement cette compétence, ajoutez-la en précisant où vous l'avez pratiquée. Sinon, ne l'ajoutez pas.",
        skillName: null,
        resumeEvidence: null,
        status: "pending",
        userNote: null,
      });
    } else if (m.kind === "mandatory" && (m.category === "experience" || m.category === "education" || m.category === "language")) {
      out.push({
        id: id("info", m.label),
        type: "information",
        requirementLabel: m.label,
        title: "Critère obligatoire non rempli d'après votre CV",
        detail: `${m.explanation} Relance ne modifie pas ce type d'information. Vous pouvez candidater en connaissance de cause, et contacter quelqu'un de l'équipe pour savoir si ce critère est strict.`,
        skillName: null,
        resumeEvidence: null,
        status: "pending",
        userNote: null,
      });
    }
  }
  return out;
}

/** Applique les suggestions acceptées à un profil vérifié (nouvelle version, l'original reste intact). */
export function applySuggestions(profile: ResumeProfile, suggestions: Suggestion[]): { profile: ResumeProfile; applied: number } {
  const skills = [...profile.skills];
  const names = new Set(skills.map((s) => normalizeForMatch(s.name)));
  let applied = 0;
  for (const s of suggestions) {
    if (s.status !== "accepted") continue;
    if (s.type === "add_skill_from_resume" && s.skillName && s.resumeEvidence) {
      if (names.has(normalizeForMatch(s.skillName))) continue;
      skills.push({ name: s.skillName, category: "skill", evidence: s.resumeEvidence });
      names.add(normalizeForMatch(s.skillName));
      applied++;
    } else if (s.type === "declare_if_true" && s.skillName && s.userNote) {
      if (names.has(normalizeForMatch(s.skillName))) continue;
      skills.push({ name: s.skillName, category: "skill", evidence: `Déclaré par vous : ${s.userNote}`.slice(0, 1000) });
      names.add(normalizeForMatch(s.skillName));
      applied++;
    }
  }
  return { profile: { ...profile, skills: skills.slice(0, 100) }, applied };
}

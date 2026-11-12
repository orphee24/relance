import { describe, expect, it } from "vitest";
import { checkMessage, type CheckContext } from "@/server/messages/checks";
import { defaultRecipient, PURPOSES, RECIPIENT_TYPES, renderTemplate, TONES, type MessageFacts, type Purpose, type RecipientType, type Tone } from "@/server/messages/templates";
import { generateMessage } from "@/server/messages/generate";
import { diagnoseSilence } from "@/server/followup/diagnosis";
import { buildCandidates, hrefFor, pickTop, type Snapshot } from "@/server/recommendations/engine";
import { sentPerWeek, statsByChannel } from "@/server/analytics/channels";
import type { LlmProvider } from "@/server/ai/provider";

const facts: MessageFacts = {
  recipient: { firstName: "Claire", lastName: "Durand", title: "Lead Product Designer" },
  recipientType: "manager",
  company: "Néobanque Exemple",
  jobTitle: "Product Designer Senior",
  applied: false,
  appliedOn: null,
  sender: { firstName: "Camille", lastName: "Martin", headline: "Product Designer" },
  strength: "Refonte du parcours d'inscription : taux de conversion +18 % en 6 mois.",
  mutualNote: null,
  isAlumni: false,
  introTarget: null,
};
const ctx: CheckContext = { format: "message", hadExchange: false, hasMutual: false, isAlumni: false };

describe("modèles de messages", () => {
  it("produit un message court, factuel, avec une demande", () => {
    const { body, subject } = renderTemplate(facts, { purpose: "first_contact", tone: "professional", format: "message" });
    expect(subject).toBeNull();
    expect(body).toBe(
      [
        "Bonjour Claire,",
        "Je m'apprête à candidater pour le poste de Product Designer Senior chez Néobanque Exemple, et je vois que vous y travaillez en tant que Lead Product Designer. Je suis Product Designer. Une réalisation récente : Refonte du parcours d'inscription : taux de conversion +18 % en 6 mois.",
        "Seriez-vous disponible pour un court échange de 15 minutes ?",
        "Bonne journée,\nCamille Martin",
      ].join("\n\n"),
    );
    expect(checkMessage(body, ctx)).toEqual([]);
  });

  it("respecte les contraintes pour toutes les combinaisons", () => {
    const formats = ["note", "message", "email"] as const;
    for (const recipientType of Object.keys(RECIPIENT_TYPES) as RecipientType[]) {
      for (const tone of Object.keys(TONES) as Tone[]) {
        for (const purpose of Object.keys(PURPOSES) as Purpose[]) {
          for (const format of formats) {
            const f = { ...facts, recipientType, isAlumni: recipientType === "alumni", mutualNote: recipientType === "mutual" ? "Ancienne collègue de Paul" : null, appliedOn: "2026-11-02", applied: true };
            const c = { format, hadExchange: purpose === "thank_you", hasMutual: recipientType === "mutual", isAlumni: recipientType === "alumni" };
            const { body } = renderTemplate(f, { purpose, tone, format });
            const errors = checkMessage(body, c).filter((i) => i.severity === "error");
            expect(errors, `${recipientType}/${tone}/${purpose}/${format}: ${body}`).toEqual([]);
          }
        }
      }
    }
  });

  it("n'invente pas de connexion commune sans information enregistrée", () => {
    const { body } = renderTemplate({ ...facts, recipientType: "mutual", mutualNote: null }, { purpose: "first_contact", tone: "warm", format: "message" });
    expect(body).not.toMatch(/commun/);
  });

  it("choisit le destinataire selon le rôle", () => {
    expect(defaultRecipient("hr", false, false)).toBe("recruiter");
    expect(defaultRecipient("other", true, false)).toBe("mutual");
    expect(defaultRecipient("peer", false, true)).toBe("alumni");
  });

  it("formule une relance de candidature avec la date d'envoi", () => {
    const { body, subject } = renderTemplate({ ...facts, recipientType: "recruiter", applied: true, appliedOn: "2026-11-02" }, { purpose: "application_follow_up", tone: "formal", format: "email" });
    expect(subject).toBe("Candidature Product Designer Senior — Camille Martin");
    expect(body).toContain("J'ai candidaté le 2 novembre pour le poste");
    expect(body).toContain("Bien cordialement,");
  });
});

describe("contrôles", () => {
  it.each([
    ["Bonjour, comme nous en avons parlé, seriez-vous disponible ?", "invented_exchange"],
    ["Bonjour, notre ami commun m'a parlé de vous. Seriez-vous disponible ?", "invented_mutual"],
    ["Bonjour, en tant qu'ancien élève de la même école, seriez-vous disponible ?", "invented_alumni"],
    ["Bonjour [Prénom], seriez-vous disponible ?", "placeholder"],
  ])("refuse %j", (text, code) => {
    expect(checkMessage(text, ctx).map((i) => i.code)).toContain(code);
  });
  it("autorise un échange enregistré", () => {
    expect(checkMessage("Merci pour notre échange d'hier. Auriez-vous un contact ?", { ...ctx, hadExchange: true })).toEqual([]);
  });
  it("signale la longueur et l'absence de demande", () => {
    const codes = checkMessage("a".repeat(700), { ...ctx, format: "note" }).map((i) => i.code);
    expect(codes).toEqual(["too_long", "no_ask"]);
  });
});

describe("génération par IA (simulée)", () => {
  const ai = (body: string): LlmProvider => ({
    id: "simulé",
    async generateStructured<T>() {
      return { data: { subject: null, body } as T, provider: "simulé", model: "simulé", usage: { inputTokens: 5, outputTokens: 5 } };
    },
  });
  it("utilise le texte de l'IA s'il passe les contrôles", async () => {
    const r = await generateMessage({ facts, purpose: "first_contact", tone: "direct", format: "message", ctx, provider: ai("Bonjour Claire, je vise le poste de Product Designer Senior. Auriez-vous 15 minutes ?") });
    expect(r.source).toBe("ai");
  });
  it("revient au modèle si l'IA invente une familiarité", async () => {
    const r = await generateMessage({ facts, purpose: "first_contact", tone: "direct", format: "message", ctx, provider: ai("Bonjour Claire, suite à notre conversation de mardi, auriez-vous 15 minutes ?") });
    expect(r).toMatchObject({ source: "template", aiRejected: true });
    expect(r.aiCall?.success).toBe(true);
  });
});

describe("diagnostic d'une candidature sans réponse", () => {
  const now = new Date(2026, 10, 12, 12);
  const base = { status: "no_response" as const, appliedAt: "2026-11-02", channel: "job_board", followUps: [], contacts: { total: 2, contacted: 0, replied: 0 }, coverage: 62, missingMandatory: ["Maîtrise de SAP"], now };

  it("sépare faits, hypothèses et inconnues", () => {
    const d = diagnoseSilence(base);
    expect(d.facts[0]).toBe("Candidature envoyée le 2 novembre (Site d'emploi), il y a 10 jours.");
    expect(d.facts).toContain("Aucune relance enregistrée.");
    expect(d.hypotheses.join(" ")).toMatch(/possibilité/);
    expect(d.unknowns).toContain("Si votre candidature a été lue.");
    expect(d.advice.kind).toBe("follow_up");
    // Jamais présenté comme un refus
    expect(JSON.stringify(d)).not.toMatch(/refus/i);
  });
  it("conseille d'attendre avant 7 jours", () => {
    expect(diagnoseSilence({ ...base, appliedAt: "2026-11-09" }).advice).toMatchObject({ kind: "wait", untilDays: 4 });
  });
  it("après une relance, oriente vers une personne identifiée", () => {
    expect(diagnoseSilence({ ...base, followUps: [{ at: "2026-11-03T10:00:00Z" }] }).advice.kind).toBe("contact_person");
  });
  it("arrête après deux relances", () => {
    const d = diagnoseSilence({ ...base, followUps: [{ at: "2026-11-03T10:00:00Z" }, { at: "2026-11-05T10:00:00Z" }], contacts: { total: 0, contacted: 0, replied: 0 } });
    expect(d.advice.kind).toBe("stop_following_up");
  });
  it("ne s'applique pas hors attente", () => {
    expect(diagnoseSilence({ ...base, status: "interview_scheduled" }).applicable).toBe(false);
  });
});

describe("actions du jour", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  const app = (over: Partial<Snapshot["applications"][number]>): Snapshot["applications"][number] => ({
    id: "a", company: "Néobanque Exemple", jobTitle: "Product Designer", status: "sent", appliedAt: "2026-11-01", nextActionAt: null, hasAnalysis: true, followUps: [], archived: false, ...over,
  });
  const snap: Snapshot = {
    now,
    hasVerifiedResume: true,
    hasUnverifiedResume: false,
    applications: [
      app({ id: "a1" }),
      app({ id: "a2", company: "Santé Exemple", status: "interview_scheduled", nextActionAt: "2026-11-14T09:00:00Z" }),
      app({ id: "a3", company: "Mobilité Exemple", status: "to_prepare", appliedAt: null, hasAnalysis: false }),
      app({ id: "a4", company: "Fini Exemple", appliedAt: "2026-09-01", followUps: ["2026-09-10", "2026-09-20"] }),
    ],
    contacts: [
      { networkId: "c1", name: "Karim B.", status: "replied", followUps: 0, lastInteractionAt: "2026-11-11T08:00:00Z", lastInteractionType: "reply_received", applicationIds: ["a1"], score: 60, roleType: "recruiter" },
      { networkId: "c2", name: "Léa R.", status: "identified", followUps: 0, lastInteractionAt: null, lastInteractionType: null, applicationIds: ["a3"], score: 55, roleType: "peer" },
      { networkId: "c3", name: "Exclu", status: "do_not_contact", followUps: 0, lastInteractionAt: null, lastInteractionType: null, applicationIds: ["a3"], score: 99, roleType: "manager" },
    ],
  };

  it("classe et justifie, une action par candidature", () => {
    const top = pickTop(buildCandidates(snap));
    expect(top.map((c) => c.kind)).toEqual(["prepare_interview", "reply_message", "contact_person"]);
    expect(top[0]!.reason).toBe("Entretien prévu dans 2 jours pour Product Designer.");
    expect(top.every((c) => c.reason.length > 20)).toBe(true);
  });
  it("n'inclut jamais une personne à ne plus contacter", () => {
    expect(buildCandidates(snap).some((c) => c.networkContactId === "c3")).toBe(false);
  });
  it("ne propose pas de 3e relance et suggère de faire le point", () => {
    const all = buildCandidates(snap);
    expect(all.find((c) => c.applicationId === "a4")?.kind).toBe("close_application");
  });
  it("demande d'abord un CV vérifié", () => {
    const top = pickTop(buildCandidates({ ...snap, hasVerifiedResume: false, contacts: [] }));
    expect(top.map((c) => c.kind)).toContain("finalize_resume");
  });
  it("produit des liens d'action", () => {
    expect(hrefFor({ kind: "follow_up_application", applicationId: "a1", networkContactId: null })).toBe("/candidatures/a1/relance");
    expect(hrefFor({ kind: "contact_person", applicationId: "a3", networkContactId: "c2" })).toBe("/reseau/c2/message?candidature=a3");
  });
});

describe("statistiques", () => {
  it("calcule les taux par canal et signale les petits échantillons", () => {
    const rows = [
      ...Array(6).fill({ status: "no_response", channel: "job_board" }),
      { status: "interview_scheduled", channel: "job_board" },
      { status: "interview_done", channel: "network_intro" },
      { status: "sent", channel: "network_intro" },
      { status: "to_prepare", channel: "network_intro" },
    ];
    const s = statsByChannel(rows);
    expect(s[0]).toMatchObject({ channel: "job_board", sent: 7, responded: 1, smallSample: false });
    expect(s[1]).toMatchObject({ channel: "network_intro", sent: 2, responded: 1, responseRate: 0.5, smallSample: true });
  });
  it("regroupe les envois par semaine", () => {
    const w = sentPerWeek(["2026-11-10", "2026-11-12", "2026-11-03", "2026-01-01"], 3, new Date("2026-11-12T10:00:00Z"));
    expect(w).toEqual([
      { weekStart: "2026-10-26", count: 0 },
      { weekStart: "2026-11-02", count: 1 },
      { weekStart: "2026-11-09", count: 2 },
    ]);
  });
});

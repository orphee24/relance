import { describe, expect, it } from "vitest";
import { applicationFormSchema, listHref, parseListFilters, reminderFormSchema } from "@/lib/validation/application";
import { firstErrors } from "@/lib/validation/auth";
import { applicationsToCsv, csvCell, toIcs, type ExportRow } from "@/server/applications/export";
import { daysBetween, dueState, requiresExplicitConfirmation, waitingInfo } from "@/server/applications/insights";

const base = {
  company_name: "Néobanque Exemple", job_title: "Product Designer", offer_url: "", location: "", salary_text: "",
  contract_type: "", channel: "", status: "to_prepare", applied_at: "", next_action: "", next_action_at: "", notes: "",
};

describe("applicationFormSchema", () => {
  it("accepte une candidature minimale", () => {
    const r = applicationFormSchema.parse(base);
    expect(r).toMatchObject({ company_name: "Néobanque Exemple", channel: null, applied_at: null });
  });
  it("renseigne la date d'envoi pour une candidature déjà envoyée", () => {
    const r = applicationFormSchema.parse({ ...base, status: "sent" });
    expect(r.applied_at).toBe(new Date().toISOString().slice(0, 10));
  });
  it("refuse une date d'envoi future, une échéance sans action et un lien invalide", () => {
    const r = applicationFormSchema.safeParse({ ...base, applied_at: "2999-01-01", next_action_at: "2026-12-01", offer_url: "javascript:alert(1)" });
    const e = firstErrors(r.error!);
    expect(Object.keys(e).sort()).toEqual(["applied_at", "next_action", "offer_url"]);
  });
  it("refuse un statut inconnu", () => {
    expect(applicationFormSchema.safeParse({ ...base, status: "ghosted" }).success).toBe(false);
  });
  it("place les rappels à 9 h par défaut", () => {
    expect(reminderFormSchema.parse({ title: "Relancer", due_at: "2026-11-20" }).due_at).toBe("2026-11-20T09:00");
  });
});

describe("filtres de liste", () => {
  it("ignore les valeurs inconnues", () => {
    const f = parseListFilters({ vue: "kanban", statut: "sent,ghosted,no_response", canal: "telepathy", tri: "random", q: "  Qonto " });
    expect(f).toEqual({ view: "kanban", q: "Qonto", statuses: ["sent", "no_response"], channel: null, sort: "recent", archived: false });
  });
  it("reconstruit une URL minimale", () => {
    const f = parseListFilters({});
    expect(listHref({}, f)).toBe("/candidatures");
    expect(listHref({ view: "kanban", statuses: ["sent"], q: "a b" }, f)).toBe("/candidatures?vue=kanban&q=a+b&statut=sent");
  });
});

describe("délais", () => {
  const now = new Date(2026, 10, 12, 15, 0);
  it("compte les jours depuis l'envoi", () => {
    expect(daysBetween("2026-11-02", now)).toBe(10);
    expect(waitingInfo("no_response", "2026-11-02", now)).toEqual({ days: 10, label: "Envoyée il y a 10 jours", tone: "attention" });
    expect(waitingInfo("sent", "2026-11-11", now)?.label).toBe("Envoyée hier");
  });
  it("n'affiche pas de délai hors attente", () => {
    expect(waitingInfo("rejected", "2026-11-02", now)).toBeNull();
    expect(waitingInfo("to_prepare", null, now)).toBeNull();
  });
  it("classe les échéances", () => {
    expect(dueState("2026-11-11T10:00:00", now)).toBe("overdue");
    expect(dueState("2026-11-12T08:00:00", now)).toBe("today");
    expect(dueState("2026-11-15T08:00:00", now)).toBe("soon");
    expect(dueState("2026-12-15T08:00:00", now)).toBe("later");
  });
  it("demande confirmation avant de marquer un refus", () => {
    expect(requiresExplicitConfirmation("rejected")).toMatch(/Sans réponse/);
    expect(requiresExplicitConfirmation("sent")).toBeNull();
  });
});

describe("export CSV", () => {
  it("neutralise les formules et échappe les séparateurs", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+33 6 12")).toBe("'+33 6 12");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("Paris; Lyon")).toBe("\"Paris; Lyon\"");
    expect(csvCell(null)).toBe("");
  });
  it("produit un fichier lisible par Excel en français", () => {
    const row: ExportRow = {
      company_name: "Néobanque Exemple", job_title: "Product Designer", status: "no_response", channel: "company_site",
      applied_at: "2026-11-02", location: "Paris", contract_type: "cdi", salary_text: "55 k€", offer_url: null,
      next_action: "Relancer", next_action_at: "2026-11-14T09:00:00+00:00", coverage_score: 92.1, created_at: "2026-11-01T10:00:00Z",
    };
    const csv = applicationsToCsv([row]);
    expect(csv.startsWith("﻿Entreprise;Poste;Statut")).toBe(true);
    expect(csv).toContain("Néobanque Exemple;Product Designer;Sans réponse;Site carrière de l'entreprise;2026-11-02;Paris;CDI;55 k€;;Relancer;2026-11-14 09:00;92;2026-11-01");
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});

describe("export calendrier", () => {
  it("produit un iCalendar valide et échappé", () => {
    const ics = toIcs([{ uid: "r1", title: "Relancer Néobanque, équipe Design; urgent", description: "ligne 1\nligne 2", start: "2026-11-14T08:00:00Z" }], new Date("2026-11-12T00:00:00Z"));
    expect(ics).toContain("BEGIN:VCALENDAR\r\n");
    expect(ics).toContain("DTSTART:20261114T080000Z");
    expect(ics).toContain("DTEND:20261114T083000Z");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("SUMMARY:Relancer Néobanque\\, équipe Design\\; urgent");
    expect(ics).toContain("DESCRIPTION:ligne 1\\nligne 2");
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("recherche", () => {
  it("neutralise la syntaxe de filtre", async () => {
    const { sanitizeSearch } = await import("@/lib/validation/application");
    expect(sanitizeSearch("Qonto,status.eq.rejected)")).toBe("Qonto status.eq.rejected");
    expect(sanitizeSearch("  L'Oréal  ")).toBe("L Oréal");
    expect(sanitizeSearch("%*\\")).toBe("");
  });
});

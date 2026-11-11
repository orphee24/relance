import { describe, expect, it } from "vitest";
import { firstErrors } from "@/lib/validation/auth";
import { formToObject, stepJobSchema, stepLocationSchema, stepPreferencesSchema } from "@/lib/validation/onboarding";

describe("onboarding", () => {
  it("exige le métier et le niveau, l'expérience chiffrée reste facultative", () => {
    expect(stepJobSchema.safeParse({ target_job: "Comptable", experience_level: "senior", experience_years: "" }).data).toEqual({
      target_job: "Comptable",
      experience_level: "senior",
      experience_years: null,
    });
    const r = stepJobSchema.safeParse({ target_job: "", experience_years: "douze" });
    expect(Object.keys(firstErrors(r.error!))).toEqual(expect.arrayContaining(["target_job", "experience_level", "experience_years"]));
  });

  it("normalise les préférences facultatives", () => {
    const r = stepPreferencesSchema.parse({
      sectors: "Santé, fintech ; santé, Industrie,, x",
      desired_salary_min: "42 000",
      desired_salary_max: "",
      available_from: "2027-01-05",
    });
    expect(r.sectors).toEqual(["Santé", "fintech", "santé", "Industrie"]);
    expect(r.desired_salary_min).toBe(42000);
    expect(r.desired_salary_max).toBeNull();
  });

  it("vérifie la cohérence de la fourchette de salaire", () => {
    const r = stepPreferencesSchema.safeParse({ sectors: "", desired_salary_min: "50000", desired_salary_max: "40000", available_from: "" });
    expect(firstErrors(r.error!).desired_salary_max).toMatch(/supérieur ou égal/);
  });

  it("lit les cases à cocher multiples et rejette les valeurs inconnues", () => {
    const fd = new FormData();
    fd.append("location", "Lyon");
    fd.append("mobility", "regional");
    fd.append("contract_types", "cdi");
    fd.append("contract_types", "freelance");
    fd.append("$ACTION_ID_x", "ignored");
    const raw = formToObject(fd, ["contract_types"]);
    expect(raw).toEqual({ location: "Lyon", mobility: "regional", contract_types: ["cdi", "freelance"] });
    expect(stepLocationSchema.parse(raw).contract_types).toEqual(["cdi", "freelance"]);
    expect(stepLocationSchema.safeParse({ ...raw, contract_types: ["inconnu"] }).success).toBe(false);
  });
});

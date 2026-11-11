import { describe, expect, it } from "vitest";
import { firstErrors, resetPasswordSchema, signInSchema, signUpSchema } from "@/lib/validation/auth";

const valid = { firstName: "Anne-Sophie", lastName: "D'Almeida", email: " Anne@Exemple.FR ", password: "motdepasse42", acceptTerms: "on" };

describe("signUpSchema", () => {
  it("accepte une inscription valide et normalise l'email", () => {
    const r = signUpSchema.safeParse(valid);
    expect(r.success).toBe(true);
    expect(r.data?.email).toBe("anne@exemple.fr");
  });
  it("exige l'acceptation des conditions", () => {
    const r = signUpSchema.safeParse({ ...valid, acceptTerms: undefined });
    expect(r.success).toBe(false);
    expect(firstErrors(r.error!).acceptTerms).toMatch(/Acceptez/);
  });
  it.each([
    ["court1", "Au moins 10 caractères."],
    ["seulementdeslettres", "Ajoutez au moins un chiffre."],
    ["1234567890", "Ajoutez au moins une lettre."],
  ])("refuse le mot de passe %s", (password, message) => {
    const r = signUpSchema.safeParse({ ...valid, password });
    expect(firstErrors(r.error!).password).toBe(message);
  });
  it("refuse les caractères inattendus dans le nom", () => {
    const r = signUpSchema.safeParse({ ...valid, firstName: "<script>" });
    expect(r.success).toBe(false);
  });
});

describe("signInSchema", () => {
  it("refuse un email invalide en français", () => {
    const r = signInSchema.safeParse({ email: "x", password: "a" });
    expect(firstErrors(r.error!).email).toBe("Cette adresse email n'est pas valide.");
  });
});

describe("resetPasswordSchema", () => {
  it("vérifie la confirmation", () => {
    const r = resetPasswordSchema.safeParse({ password: "motdepasse42", confirmPassword: "motdepasse43" });
    expect(firstErrors(r.error!).confirmPassword).toMatch(/ne correspondent pas/);
  });
});

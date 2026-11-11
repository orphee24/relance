import { describe, expect, it } from "vitest";
import { formatRate, safeRedirectPath } from "@/lib/utils";

describe("safeRedirectPath", () => {
  it("accepte les chemins internes", () => {
    expect(safeRedirectPath("/candidatures?tri=date")).toBe("/candidatures?tri=date");
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "candidatures",
    "/ok\n//evil",
    "",
  ])("refuse %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/tableau-de-bord");
  });
  it("utilise la valeur de repli fournie", () => {
    expect(safeRedirectPath(null, "/x")).toBe("/x");
  });
});

describe("formatRate", () => {
  it("ne produit pas de taux sans dénominateur", () => {
    expect(formatRate(0, 0)).toBeNull();
  });
  it("formate en pourcentage français", () => {
    expect(formatRate(1, 4)?.replace(/\s/g, " ")).toBe("25 %");
  });
});

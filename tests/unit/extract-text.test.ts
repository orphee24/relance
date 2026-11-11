import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanExtractedText, detectKind, extractResumeText } from "@/server/cv/extract-text";

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)));

describe("detectKind", () => {
  it("reconnaît PDF et DOCX par leur signature", () => {
    expect(detectKind(fixture("cv-exemple.pdf"))).toBe("pdf");
    expect(detectKind(fixture("cv-exemple.docx"))).toBe("docx");
  });
  it("refuse un fichier déguisé", () => {
    expect(detectKind(new TextEncoder().encode("<html>pas un pdf</html>"))).toBeNull();
    expect(detectKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]))).toBeNull(); // zip non Word
  });
});

describe("extractResumeText", () => {
  it("extrait le texte d'un PDF", async () => {
    const r = await extractResumeText(fixture("cv-exemple.pdf"));
    expect(r.kind).toBe("pdf");
    expect(r.text).toContain("Camille Martin");
    expect(r.text).toContain("EXPÉRIENCE PROFESSIONNELLE");
  });
  it("extrait le texte d'un DOCX", async () => {
    const r = await extractResumeText(fixture("cv-exemple.docx"));
    expect(r.kind).toBe("docx");
    expect(r.text).toContain("Figma, Design system");
  });
  it("signale un PDF sans texte (scan)", async () => {
    await expect(extractResumeText(fixture("cv-scan-sans-texte.pdf"))).rejects.toMatchObject({ code: "no_text" });
  });
  it("refuse les fichiers vides, trop lourds ou d'un autre type", async () => {
    await expect(extractResumeText(new Uint8Array())).rejects.toMatchObject({ code: "empty_file" });
    await expect(extractResumeText(new Uint8Array(5 * 1024 * 1024 + 1))).rejects.toMatchObject({ code: "too_large" });
    await expect(extractResumeText(new TextEncoder().encode("bonjour"))).rejects.toMatchObject({ code: "unsupported_type" });
  });
});

describe("cleanExtractedText", () => {
  it("retire les caractères invisibles et de contrôle bidi", () => {
    expect(cleanExtractedText("A\u200Bb\u202Ec  d\n\n\n\ne")).toBe("Abc d\n\ne");
  });
});

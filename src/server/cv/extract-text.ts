import "server-only";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_CHARS = 50_000;

export const RESUME_MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

export type ResumeKind = keyof typeof RESUME_MIME;

export class ExtractionError extends Error {
  constructor(
    public readonly code: "too_large" | "empty_file" | "unsupported_type" | "unreadable" | "no_text",
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Le type déclaré par le navigateur n'est jamais cru : on lit la signature du fichier. */
export function detectKind(bytes: Uint8Array): ResumeKind | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) {
    return "pdf"; // %PDF-
  }
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    // Archive ZIP : on vérifie la présence de la partie principale Word dans l'en-tête central.
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 64 * 1024)));
    const tail = new TextDecoder("latin1").decode(bytes.subarray(Math.max(0, bytes.length - 64 * 1024)));
    if (head.includes("word/") || tail.includes("word/document.xml")) return "docx";
  }
  return null;
}

/** Nettoie le texte extrait : caractères de contrôle, espaces multiples, lignes vides en excès. */
export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return (Array.isArray(text) ? text : [text]).join("\n\n");
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

export interface ExtractedResume {
  kind: ResumeKind;
  mimeType: string;
  text: string;
}

export async function extractResumeText(bytes: Uint8Array): Promise<ExtractedResume> {
  if (bytes.length === 0) throw new ExtractionError("empty_file", "Le fichier est vide.");
  if (bytes.length > MAX_RESUME_BYTES) throw new ExtractionError("too_large", "Le fichier dépasse 5 Mo.");

  const kind = detectKind(bytes);
  if (!kind) throw new ExtractionError("unsupported_type", "Seuls les fichiers PDF et Word (.docx) sont acceptés.");

  let raw: string;
  try {
    raw = kind === "pdf" ? await extractPdf(bytes) : await extractDocx(bytes);
  } catch {
    throw new ExtractionError("unreadable", "Le fichier n'a pas pu être lu. Il est peut-être protégé par un mot de passe ou endommagé.");
  }

  const text = cleanExtractedText(raw);
  if (text.replace(/\s/g, "").length < 50) {
    throw new ExtractionError(
      "no_text",
      "Aucun texte n'a été trouvé. Si votre CV est une image ou un scan, exportez-le en PDF depuis votre traitement de texte.",
    );
  }
  return { kind, mimeType: RESUME_MIME[kind], text };
}

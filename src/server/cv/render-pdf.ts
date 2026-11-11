import "server-only";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { ResumeProfile } from "@/lib/validation/resume-profile";

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 54;
const INK = rgb(0.094, 0.129, 0.114);
const MUTED = rgb(0.36, 0.41, 0.39);
const ACCENT = rgb(0.039, 0.42, 0.302);
const LINE = rgb(0.85, 0.88, 0.86);

/** Les polices standard PDF n'encodent que WinAnsi : on remplace proprement le reste. */
function makeSanitizer(font: PDFFont) {
  const cache = new Map<string, string>();
  const replacements: Record<string, string> = { "→": "->", "≤": "<=", "≥": ">=", "−": "-", "\u00A0": " ", "\u202F": " " };
  return (s: string) =>
    Array.from(s.normalize("NFC"))
      .map((ch) => {
        const hit = cache.get(ch);
        if (hit !== undefined) return hit;
        let out = replacements[ch] ?? ch;
        try {
          font.encodeText(out);
        } catch {
          out = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
          try {
            font.encodeText(out);
          } catch {
            out = "";
          }
        }
        cache.set(ch, out);
        return out;
      })
      .join("");
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderResumePdf(profile: ResumeProfile, meta: { title: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(meta.title);
  doc.setCreator("Relance");
  doc.setProducer("Relance");
  doc.setLanguage("fr-FR");

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = makeSanitizer(regular);
  const width = A4.w - MARGIN * 2;

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;

  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([A4.w, A4.h]);
      y = A4.h - MARGIN;
    }
  };

  const text = (value: string, opts: { font?: PDFFont; size?: number; color?: typeof INK; gap?: number; indent?: number } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    for (const line of wrap(clean(value), font, size, width - indent)) {
      ensure(size * 1.45);
      y -= size * 1.2;
      page.drawText(line, { x: MARGIN + indent, y, size, font, color: opts.color ?? INK });
      y -= size * 0.25;
    }
    y -= opts.gap ?? 0;
  };

  const section = (title: string) => {
    ensure(40);
    y -= 14;
    text(title, { font: bold, size: 11, color: ACCENT });
    page.drawLine({ start: { x: MARGIN, y: y - 2 }, end: { x: A4.w - MARGIN, y: y - 2 }, thickness: 0.6, color: LINE });
    y -= 10;
  };

  const { identity } = profile;
  text(identity.fullName ?? meta.title, { font: bold, size: 20, gap: 2 });
  if (identity.headline) text(identity.headline, { size: 12, color: ACCENT, gap: 2 });
  const contact = [identity.email, identity.phone, identity.location].filter(Boolean).join("   |   ");
  if (contact) text(contact, { size: 9.5, color: MUTED });

  if (profile.summary) {
    section("Profil");
    text(profile.summary);
  }

  if (profile.experiences.length) {
    section("Expérience professionnelle");
    profile.experiences.forEach((x, i) => {
      ensure(48);
      text([x.title, x.company].filter(Boolean).join(" — "), { font: bold, size: 10.5 });
      const when = [x.startDate, x.isCurrent ? "aujourd'hui" : x.endDate].filter(Boolean).join(" – ");
      const meta2 = [when, x.location].filter(Boolean).join("   |   ");
      if (meta2) text(meta2, { size: 9, color: MUTED, gap: 2 });
      for (const a of x.achievements) {
        ensure(16);
        page.drawCircle({ x: MARGIN + 4, y: y - 7, size: 1.4, color: INK });
        text(a, { indent: 12 });
      }
      if (i < profile.experiences.length - 1) y -= 8;
    });
  }

  if (profile.education.length) {
    section("Formation");
    for (const e of profile.education) {
      text([e.degree, e.institution].filter(Boolean).join(" — "), { font: bold, size: 10.5 });
      if (e.year) text(e.year, { size: 9, color: MUTED, gap: 4 });
    }
  }

  if (profile.skills.length) {
    section("Compétences");
    text(profile.skills.map((s) => s.name).join(", "));
  }

  if (profile.languages.length) {
    section("Langues");
    text(profile.languages.map((l) => (l.level ? `${l.name} (${l.level})` : l.name)).join(", "));
  }

  return doc.save();
}

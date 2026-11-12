import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/config/domain";
import { CHANNELS, type Channel } from "@/lib/validation/application";
import { CONTRACT_TYPES } from "@/lib/validation/onboarding";

export interface ExportRow {
  company_name: string;
  job_title: string;
  status: ApplicationStatus;
  channel: string | null;
  applied_at: string | null;
  location: string | null;
  contract_type: string | null;
  salary_text: string | null;
  offer_url: string | null;
  next_action: string | null;
  next_action_at: string | null;
  coverage_score: number | null;
  created_at: string;
}

/**
 * Neutralise les cellules interprétées comme formules par les tableurs (injection CSV) :
 * une cellule qui commence par = + - @ tabulation ou retour chariot est préfixée d'une apostrophe.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  "Entreprise", "Poste", "Statut", "Canal", "Date d'envoi", "Lieu", "Contrat", "Salaire",
  "Lien de l'offre", "Prochaine action", "Échéance", "Couverture estimée (%)", "Ajoutée le",
];

/** CSV pour Excel en français : séparateur « ; », BOM UTF-8, fins de ligne CRLF. */
export function applicationsToCsv(rows: ExportRow[]): string {
  const lines = rows.map((r) =>
    [
      r.company_name,
      r.job_title,
      APPLICATION_STATUS_LABELS[r.status],
      r.channel ? CHANNELS[r.channel as Channel] ?? r.channel : "",
      r.applied_at ?? "",
      r.location,
      r.contract_type ? CONTRACT_TYPES[r.contract_type as keyof typeof CONTRACT_TYPES] ?? r.contract_type : "",
      r.salary_text,
      r.offer_url,
      r.next_action,
      r.next_action_at ? r.next_action_at.slice(0, 16).replace("T", " ") : "",
      r.coverage_score != null ? Math.round(r.coverage_score) : "",
      r.created_at.slice(0, 10),
    ]
      .map(csvCell)
      .join(";"),
  );
  return `\uFEFF${[HEADERS.map(csvCell).join(";"), ...lines].join("\r\n")}\r\n`;
}

// --- Calendrier (iCalendar) ------------------------------------------------------

export interface CalendarItem {
  uid: string;
  title: string;
  description?: string | null;
  start: string; // ISO
}

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Plie les lignes à 75 octets comme l'exige la RFC 5545. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  for (const ch of line) {
    if (new TextEncoder().encode(current + ch).length > (out.length ? 74 : 75)) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n ");
}

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function toIcs(items: CalendarItem[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Relance//Candidatures//FR",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Relance — candidatures",
    ...items.flatMap((i) => [
      "BEGIN:VEVENT",
      `UID:${i.uid}@relance`,
      `DTSTAMP:${icsDate(now.toISOString())}`,
      `DTSTART:${icsDate(i.start)}`,
      `DTEND:${icsDate(new Date(new Date(i.start).getTime() + 30 * 60 * 1000).toISOString())}`,
      `SUMMARY:${icsText(i.title)}`,
      ...(i.description ? [`DESCRIPTION:${icsText(i.description)}`] : []),
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

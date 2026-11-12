import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, ArchiveRestore, BellRing, Check, ExternalLink, FileText, RotateCcw, ScanSearch, Users } from "lucide-react";
import { DueLabel } from "@/components/applications/due-label";
import { EditableDetails, NoteForm, ReminderForm, StatusControl } from "@/components/applications/detail-controls";
import { StatusBadge } from "@/components/applications/status";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "@/config/domain";
import { createClient } from "@/lib/supabase/server";
import { CHANNELS, type Channel } from "@/lib/validation/application";
import { CONTRACT_TYPES } from "@/lib/validation/onboarding";
import { waitingInfo } from "@/server/applications/insights";
import { completeReminder, deleteApplication, setArchived } from "../actions";
import { DeleteApplicationButton } from "./delete-button";

export const metadata: Metadata = { title: "Candidature" };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

interface EventRow {
  id: string;
  type: string;
  from_status: ApplicationStatus | null;
  to_status: ApplicationStatus | null;
  occurred_at: string;
  payload: { text?: string } | null;
}

function describeEvent(e: EventRow): { title: string; text?: string } {
  switch (e.type) {
    case "created":
      return { title: `Candidature ajoutée${e.to_status ? ` (${APPLICATION_STATUS_LABELS[e.to_status]})` : ""}` };
    case "status_changed":
      return {
        title: `${e.from_status ? APPLICATION_STATUS_LABELS[e.from_status] : "?"} → ${e.to_status ? APPLICATION_STATUS_LABELS[e.to_status] : "?"}`,
      };
    case "note":
      return { title: "Note", text: e.payload?.text };
    default:
      return { title: e.type, text: e.payload?.text };
  }
}

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [{ data: app }, { data: events }, { data: reminders }] = await Promise.all([
    supabase
      .from("applications")
      .select(
        "id, company_name, job_title, offer_url, location, salary_text, contract_type, channel, status, applied_at, next_action, next_action_at, notes, archived_at, created_at, offer_id, job_offers(id, coverage_score), resume_versions(id, label, version_no, resume_id)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("application_events").select("id, type, from_status, to_status, occurred_at, payload").eq("application_id", id).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("reminders").select("id, title, due_at, completed_at").eq("application_id", id).order("due_at"),
  ]);
  if (!app) notFound();

  const offer = Array.isArray(app.job_offers) ? app.job_offers[0] : app.job_offers;
  const version = Array.isArray(app.resume_versions) ? app.resume_versions[0] : app.resume_versions;
  const status = app.status as ApplicationStatus;
  const waiting = waitingInfo(status, app.applied_at);
  const openReminders = (reminders ?? []).filter((r) => !r.completed_at);
  const doneReminders = (reminders ?? []).filter((r) => r.completed_at);
  const contract = app.contract_type ? CONTRACT_TYPES[app.contract_type as keyof typeof CONTRACT_TYPES] : null;

  const details: [string, React.ReactNode][] = [
    ["Date d'envoi", app.applied_at ? dateFmt.format(new Date(`${app.applied_at}T12:00:00`)) : null],
    ["Canal", app.channel ? CHANNELS[app.channel as Channel] : null],
    ["Lieu", app.location],
    ["Contrat", contract],
    ["Salaire annoncé", app.salary_text],
    ["Ajoutée le", dateFmt.format(new Date(app.created_at))],
  ];

  return (
    <>
      <PageHeader
        title={app.job_title}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="font-medium text-ink">{app.company_name}</span>
            <StatusBadge status={status} />
            {waiting ? <span className={waiting.tone === "attention" ? "text-ink" : undefined}>{waiting.label}</span> : null}
            {app.archived_at ? <span>Archivée</span> : null}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            {app.offer_url ? (
              <Button variant="secondary" asChild>
                <a href={app.offer_url} target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink />
                  Voir l&apos;offre
                </a>
              </Button>
            ) : null}
            {!app.archived_at ? <StatusControl id={app.id} status={status} /> : null}
          </div>
        }
      />

      <div className="grid gap-4">
        {sp.creee ? <Alert tone="success">Candidature ajoutée. Programmez une prochaine action pour ne pas la perdre de vue.</Alert> : null}
        {sp.archivee ? <Alert tone="success">Candidature archivée : elle ne compte plus dans la limite de votre forfait.</Alert> : null}
        {sp.restauree ? <Alert tone="success">Candidature restaurée.</Alert> : null}
        {sp.erreur === "limite" ? (
          <Alert tone="danger">Vous suivez déjà le nombre maximal de candidatures de votre forfait. Archivez-en une autre d&apos;abord.</Alert>
        ) : null}
        {status === "no_response" ? (
          <Alert tone="info" title="Sans réponse ne veut pas dire refusée">
            Les délais de réponse varient beaucoup d&apos;une entreprise à l&apos;autre. Une relance courte, ou un contact dans
            l&apos;équipe, permet souvent d&apos;en savoir plus.
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <Panel>
              <PanelHeader title="Informations" />
              <PanelBody>
                <EditableDetails
                  defaults={{
                    id: app.id,
                    company_name: app.company_name,
                    job_title: app.job_title,
                    offer_url: app.offer_url,
                    location: app.location,
                    salary_text: app.salary_text,
                    contract_type: app.contract_type,
                    channel: app.channel,
                    status: app.status,
                    applied_at: app.applied_at,
                    next_action: app.next_action,
                    next_action_at: app.next_action_at,
                    notes: app.notes,
                  }}
                >
                  <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                    {details.map(([label, value]) => (
                      <div key={label} className="grid gap-0.5">
                        <dt className="text-muted">{label}</dt>
                        <dd>{value ?? <span className="text-faint">Non renseigné</span>}</dd>
                      </div>
                    ))}
                  </dl>
                  {app.notes ? <p className="whitespace-pre-line rounded-control bg-sunken p-3 text-sm">{app.notes}</p> : null}
                </EditableDetails>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Historique" description="Chaque changement de statut est enregistré automatiquement." />
              <PanelBody className="grid gap-5">
                <NoteForm id={app.id} />
                {events && events.length > 0 ? (
                  <ol className="grid gap-0 border-l border-line pl-5">
                    {(events as EventRow[]).map((e) => {
                      const d = describeEvent(e);
                      return (
                        <li key={e.id} className="relative pb-4 last:pb-0">
                          <span aria-hidden="true" className={`absolute -left-[25px] top-1.5 size-2 rounded-full ${e.type === "note" ? "bg-line-strong" : "bg-emerald"}`} />
                          <p className="text-sm font-medium">{d.title}</p>
                          {d.text ? <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{d.text}</p> : null}
                          <p className="mt-0.5 text-xs text-faint">{dateTimeFmt.format(new Date(e.occurred_at))}</p>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </PanelBody>
            </Panel>
          </div>

          <div className="grid content-start gap-4">
            <Panel>
              <PanelHeader title="Prochaine action et rappels" />
              <PanelBody className="grid gap-4">
                {app.next_action || app.next_action_at ? (
                  <p className="text-sm">
                    <span className="font-medium">{app.next_action ?? "Prochaine action"}</span>
                    {app.next_action_at ? (
                      <>
                        {" — "}
                        <DueLabel at={app.next_action_at} />
                      </>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-sm text-muted">Aucune prochaine action. Ajoutez-en une avec « Modifier ».</p>
                )}
                {openReminders.length > 0 ? (
                  <ul className="grid gap-2">
                    {openReminders.map((r) => (
                      <li key={r.id} className="flex items-center gap-3 rounded-control border border-line px-3 py-2 text-sm">
                        <BellRing className="size-4 shrink-0 text-emerald" aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{r.title}</span>
                          <DueLabel at={r.due_at} className="text-xs text-muted" />
                        </span>
                        <form action={completeReminder}>
                          <input type="hidden" name="id" value={app.id} />
                          <input type="hidden" name="reminderId" value={r.id} />
                          <Button type="submit" variant="ghost" size="icon" aria-label={`Marquer « ${r.title} » comme fait`} title="Marquer comme fait">
                            <Check />
                          </Button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="border-t border-line pt-4">
                  <ReminderForm id={app.id} />
                </div>
                {doneReminders.length > 0 ? (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted hover:text-ink">Rappels terminés ({doneReminders.length})</summary>
                    <ul className="mt-2 grid gap-1">
                      {doneReminders.map((r) => (
                        <li key={r.id} className="flex items-center gap-2 text-muted">
                          <span className="min-w-0 flex-1 truncate line-through">{r.title}</span>
                          <form action={completeReminder}>
                            <input type="hidden" name="id" value={app.id} />
                            <input type="hidden" name="reminderId" value={r.id} />
                            <input type="hidden" name="undo" value="1" />
                            <Button type="submit" variant="ghost" size="icon" aria-label={`Rouvrir « ${r.title} »`} title="Rouvrir">
                              <RotateCcw />
                            </Button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Offre et CV" />
              <PanelBody className="grid gap-3 text-sm">
                {offer ? (
                  <Link href={`/analyser/${offer.id}`} className="flex items-center gap-3 rounded-control border border-line px-3 py-2.5 hover:border-emerald/50 hover:bg-sunken">
                    <ScanSearch className="size-4 shrink-0 text-emerald" aria-hidden="true" />
                    <span className="flex-1">Analyse de l&apos;offre</span>
                    <span className="font-semibold tabular-nums">{offer.coverage_score != null ? `${Math.round(Number(offer.coverage_score))} %` : "—"}</span>
                  </Link>
                ) : (
                  <p className="text-muted">
                    Offre non analysée.{" "}
                    <Link href="/analyser" className="font-medium text-emerald hover:underline">
                      Analyser une offre
                    </Link>
                  </p>
                )}
                {version ? (
                  <Link href={`/cv/${version.resume_id}`} className="flex items-center gap-3 rounded-control border border-line px-3 py-2.5 hover:border-emerald/50 hover:bg-sunken">
                    <FileText className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    <span className="flex-1 truncate">CV : {version.label ?? `version ${version.version_no}`}</span>
                  </Link>
                ) : null}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Personnes à contacter" />
              <PanelBody>
                <EmptyState
                  icon={Users}
                  title="Aucun contact vérifié trouvé pour le moment."
                  description="La recherche assistée de collaborateurs, l'import de vos contacts et les pages officielles de l'entreprise arrivent avec la phase 5. Relance ne propose jamais de profil inventé."
                />
              </PanelBody>
            </Panel>

            <Panel>
              <PanelBody className="flex flex-wrap items-center gap-2">
                <form action={setArchived}>
                  <input type="hidden" name="id" value={app.id} />
                  <input type="hidden" name="archive" value={app.archived_at ? "0" : "1"} />
                  <Button type="submit" variant="secondary" size="sm">
                    {app.archived_at ? <ArchiveRestore /> : <Archive />}
                    {app.archived_at ? "Restaurer" : "Archiver"}
                  </Button>
                </form>
                <DeleteApplicationButton id={app.id} action={deleteApplication} />
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

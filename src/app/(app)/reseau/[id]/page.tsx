import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ContactNotesForm, InteractionForm } from "@/components/network/forms";
import { VerificationBadge } from "@/components/network/person-card";
import { Button } from "@/components/ui/button";
import { Alert, Badge } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import { NETWORK_CONTACT_STATUS_LABELS } from "@/config/domain";
import { createClient } from "@/lib/supabase/server";
import { INTERACTION_CHANNELS, INTERACTION_TYPES, NETWORK_STATUSES, PROVIDER_LABELS, ROLE_LABELS } from "@/lib/validation/network";
import { STRATEGIES } from "@/server/network/engine";
import { loadNetworkContact } from "@/server/network/load";
import { confirmEmployment, deleteContact, setContactStatus } from "../actions";
import { DeleteContactButton } from "./delete-contact";

export const metadata: Metadata = { title: "Contact" };

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" });

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ajoute?: string }> }) {
  const { id } = await params;
  const { ajoute } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const loaded = await loadNetworkContact(supabase, id);
  if (!loaded) notFound();
  const { view: p, notes } = loaded;

  const [{ data: sources }, { data: verifications }, { data: interactions }, { data: links }] = await Promise.all([
    supabase.from("contact_sources").select("id, provider, source_url, legal_basis, retrieved_at").eq("contact_id", p.contactId).order("retrieved_at", { ascending: false }),
    supabase.from("contact_verifications").select("id, method, result, note, verified_at").eq("contact_id", p.contactId).order("verified_at", { ascending: false }),
    supabase.from("networking_interactions").select("id, type, channel, summary, occurred_at").eq("network_contact_id", id).order("occurred_at", { ascending: false }).limit(100),
    supabase.from("application_contacts").select("relevance_score, applications(id, company_name, job_title)").eq("network_contact_id", id),
  ]);
  const dnc = p.status === "do_not_contact";

  return (
    <>
      <PageHeader
        title={p.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span>{[p.title, p.company].filter(Boolean).join(" · ") || "Fonction non renseignée"}</span>
            <VerificationBadge p={p} />
          </span>
        }
        actions={
          p.profileUrl ? (
            <Button variant="secondary" asChild>
              <a href={p.profileUrl} target="_blank" rel="noopener noreferrer nofollow">
                <ExternalLink />
                Voir le profil
              </a>
            </Button>
          ) : null
        }
      />
      <div className="grid gap-4">
        {ajoute ? <Alert tone="success">Personne ajoutée à votre réseau.</Alert> : null}
        {dnc ? (
          <Alert tone="info" title="Ne plus contacter">
            Relance ne vous proposera plus cette personne et vous empêche d&apos;enregistrer un message vers elle.
          </Alert>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="grid content-start gap-4">
            <Panel>
              <PanelHeader title="Échanges" description="Un message envoyé passe la personne en « Contacté » ; une réponse en « A répondu »." />
              <PanelBody className="grid gap-5">
                <InteractionForm networkId={id} blocked={dnc} />
                {interactions?.length ? (
                  <ol className="grid border-l border-line pl-5">
                    {interactions.map((i) => (
                      <li key={i.id} className="relative pb-4 last:pb-0">
                        <span aria-hidden="true" className="absolute -left-[25px] top-1.5 size-2 rounded-full bg-emerald" />
                        <p className="text-sm font-medium">
                          {INTERACTION_TYPES[i.type as keyof typeof INTERACTION_TYPES] ?? i.type}
                          {i.channel ? <span className="font-normal text-muted"> · {INTERACTION_CHANNELS[i.channel as keyof typeof INTERACTION_CHANNELS]}</span> : null}
                        </p>
                        {i.summary ? <p className="mt-0.5 whitespace-pre-line text-sm text-muted">{i.summary}</p> : null}
                        <p className="mt-0.5 text-xs text-faint">{dateFmt.format(new Date(i.occurred_at))}</p>
                      </li>
                    ))}
                  </ol>
                ) : null}
                {p.followUps >= 2 ? <Alert tone="info">Déjà relancée {p.followUps} fois. Mieux vaut attendre ou passer par quelqu&apos;un d&apos;autre.</Alert> : null}
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Candidatures liées" />
              {links?.length ? (
                <ul className="divide-y divide-line">
                  {links.map((l, i) => {
                    const a = Array.isArray(l.applications) ? l.applications[0] : l.applications;
                    return a ? (
                      <li key={i} className="flex items-center gap-3 px-5 py-3 text-sm">
                        <Link href={`/candidatures/${a.id}#personnes`} className="min-w-0 flex-1 truncate font-medium hover:text-emerald hover:underline">
                          {a.job_title} — {a.company_name}
                        </Link>
                        <span className="tabular-nums text-muted">{l.relevance_score ?? "—"}/100</span>
                      </li>
                    ) : null;
                  })}
                </ul>
              ) : (
                <PanelBody className="text-sm text-muted">Pas encore rattachée à une candidature.</PanelBody>
              )}
            </Panel>
          </div>

          <div className="grid content-start gap-4">
            <Panel>
              <PanelHeader title="Statut" />
              <PanelBody className="grid gap-3">
                <form action={setContactStatus} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="networkId" value={id} />
                  <label className="grid flex-1 gap-1 text-xs text-muted">
                    Statut actuel
                    <select name="status" defaultValue={p.status} className="h-10 rounded-control border border-line-strong bg-surface px-3 text-base text-ink sm:text-sm">
                      {NETWORK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {NETWORK_CONTACT_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button type="submit" variant="secondary">
                    Modifier
                  </Button>
                </form>
                <dl className="grid gap-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Rôle</dt>
                    <dd>{ROLE_LABELS[p.roleType]}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Approche adaptée</dt>
                    <dd>{STRATEGIES[p.strategy].label}</dd>
                  </div>
                  {p.department ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Service</dt>
                      <dd>{p.department}</dd>
                    </div>
                  ) : null}
                  {p.location ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Lieu</dt>
                      <dd>{p.location}</dd>
                    </div>
                  ) : null}
                </dl>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Sources et vérifications" description="D'où vient chaque information." />
              <PanelBody className="grid gap-4 text-sm">
                <ul className="grid gap-2">
                  {(sources ?? []).map((s) => (
                    <li key={s.id} className="grid gap-0.5">
                      <span className="font-medium">{PROVIDER_LABELS[s.provider] ?? s.provider}</span>
                      <span className="text-xs text-muted">
                        {dateFmt.format(new Date(s.retrieved_at))}
                        {s.source_url ? (
                          <>
                            {" · "}
                            <a href={s.source_url} target="_blank" rel="noopener noreferrer nofollow" className="text-emerald hover:underline">
                              page consultée
                            </a>
                          </>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {verifications?.length ? (
                  <ul className="grid gap-1 border-t border-line pt-3">
                    {verifications.map((v) => (
                      <li key={v.id} className="flex items-start gap-2">
                        <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald" aria-hidden="true" />
                        <span>
                          Confirmé le {dateFmt.format(new Date(v.verified_at))}
                          {v.note ? <span className="block text-xs text-muted">{v.note}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <form action={confirmEmployment} className="grid gap-2 border-t border-line pt-3">
                  <input type="hidden" name="networkId" value={id} />
                  <label className="grid gap-1 text-xs text-muted">
                    Comment l&apos;avez-vous vérifié ? (facultatif)
                    <input name="note" maxLength={500} placeholder="Profil consulté ce jour" className="h-9 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink" />
                  </label>
                  <Button type="submit" variant="secondary" size="sm" className="justify-self-start">
                    <BadgeCheck />
                    Je confirme qu&apos;elle occupe ce poste aujourd&apos;hui
                  </Button>
                </form>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Notes" />
              <PanelBody>
                <ContactNotesForm networkId={id} notes={notes} hasMutual={p.hasMutual} mutualNote={p.mutualNote} />
              </PanelBody>
            </Panel>

            <Panel>
              <PanelBody className="flex flex-wrap items-center gap-2">
                {p.hasMutual ? <Badge tone="emerald">Connexion commune</Badge> : null}
                <DeleteContactButton id={id} action={deleteContact} />
              </PanelBody>
            </Panel>
          </div>
        </div>
      </div>
    </>
  );
}

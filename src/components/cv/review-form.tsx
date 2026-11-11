"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { verifyResume } from "@/app/(app)/cv/actions";
import { SubmitButton } from "@/components/auth/form-parts";
import { Button } from "@/components/ui/button";
import { ConfidenceMark } from "@/components/ui/confidence";
import { Field, Input, Label } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/panel";
import type { FormState } from "@/lib/validation/auth";
import {
  type Education,
  type Experience,
  type Language,
  type ResumeProfile,
  type Skill,
  USER_EVIDENCE,
} from "@/lib/validation/resume-profile";
import { cn } from "@/lib/utils";

type SkillRow = Skill & { kept: boolean };

const textareaClass =
  "min-h-24 w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-faint focus-visible:border-emerald focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald/25 sm:text-sm";

function Evidence({ text }: { text: string }) {
  if (text === USER_EVIDENCE) {
    return <p className="text-xs text-muted">Saisi par vous</p>;
  }
  return (
    <details className="text-xs text-muted">
      <summary className="cursor-pointer select-none hover:text-ink">Voir l&apos;extrait du CV</summary>
      <blockquote className="mt-1.5 whitespace-pre-line border-l-2 border-line-strong pl-3">{text}</blockquote>
    </details>
  );
}

export function ResumeReviewForm({
  resumeId,
  initial,
  next,
  defaultLabel,
}: {
  resumeId: string;
  initial: ResumeProfile;
  next?: string;
  defaultLabel: string;
}) {
  const [state, action] = useActionState(verifyResume, { status: "idle" } as FormState);
  const [identity, setIdentity] = useState(initial.identity);
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [experiences, setExperiences] = useState<Experience[]>(initial.experiences);
  const [education, setEducation] = useState<Education[]>(initial.education);
  const [skills, setSkills] = useState<SkillRow[]>(initial.skills.map((s) => ({ ...s, kept: true })));
  const [languages, setLanguages] = useState<Language[]>(initial.languages);
  const [newSkill, setNewSkill] = useState("");

  const profile: ResumeProfile = {
    identity: Object.fromEntries(
      Object.entries(identity).map(([k, v]) => [k, typeof v === "string" && v.trim() ? v.trim() : null]),
    ) as ResumeProfile["identity"],
    summary: summary.trim() || null,
    experiences: experiences
      .filter((x) => x.title.trim())
      .map((x) => ({ ...x, achievements: x.achievements.map((a) => a.trim()).filter(Boolean) })),
    education: education.filter((e) => e.degree.trim()),
    skills: skills.filter((s) => s.kept && s.name.trim()).map((s) => ({ name: s.name, category: s.category, evidence: s.evidence })),
    languages: languages.filter((l) => l.name.trim()),
  };

  const updateExp = (i: number, patch: Partial<Experience>) =>
    setExperiences((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updateEdu = (i: number, patch: Partial<Education>) =>
    setEducation((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const updateLang = (i: number, patch: Partial<Language>) =>
    setLanguages((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const addSkill = () => {
    const name = newSkill.trim();
    if (!name || skills.some((s) => s.name.toLowerCase() === name.toLowerCase())) return setNewSkill("");
    setSkills((xs) => [...xs, { name, category: "skill", evidence: USER_EVIDENCE, kept: true }]);
    setNewSkill("");
  };

  const keptCount = skills.filter((s) => s.kept).length;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="resumeId" value={resumeId} />
      <input type="hidden" name="profile" value={JSON.stringify(profile)} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Panel>
        <PanelHeader title="Identité" />
        <PanelBody className="grid gap-4 sm:grid-cols-2">
          {(
            [
              ["fullName", "Nom complet", "name"],
              ["headline", "Titre professionnel", "organization-title"],
              ["email", "Email", "email"],
              ["phone", "Téléphone", "tel"],
              ["location", "Localisation", "address-level2"],
            ] as const
          ).map(([key, label, autoComplete]) => (
            <Field key={key} id={`id-${key}`} label={label}>
              {(a) => (
                <Input
                  {...a}
                  autoComplete={autoComplete}
                  value={identity[key] ?? ""}
                  onChange={(e) => setIdentity((s) => ({ ...s, [key]: e.target.value }))}
                />
              )}
            </Field>
          ))}
        </PanelBody>
        <PanelBody className="border-t border-line">
          <Label htmlFor="summary">Profil / résumé</Label>
          <textarea id="summary" className={cn(textareaClass, "mt-1.5")} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={2000} />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title={`Expériences (${experiences.length})`}
          description="Corrigez les intitulés et les dates. Une réalisation par ligne."
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setExperiences((xs) => [
                  ...xs,
                  { title: "", company: null, location: null, startDate: null, endDate: null, isCurrent: false, achievements: [], evidence: USER_EVIDENCE },
                ])
              }
            >
              <Plus />
              Ajouter
            </Button>
          }
        />
        <ul className="divide-y divide-line">
          {experiences.length === 0 ? <li className="px-5 py-4 text-sm text-muted">Aucune expérience identifiée.</li> : null}
          {experiences.map((x, i) => (
            <li key={i} className="grid gap-3 px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field id={`exp-${i}-title`} label="Intitulé du poste">
                  {(a) => <Input {...a} value={x.title} onChange={(e) => updateExp(i, { title: e.target.value })} required />}
                </Field>
                <Field id={`exp-${i}-company`} label="Entreprise">
                  {(a) => <Input {...a} value={x.company ?? ""} onChange={(e) => updateExp(i, { company: e.target.value || null })} />}
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
                <Field id={`exp-${i}-start`} label="Début">
                  {(a) => <Input {...a} value={x.startDate ?? ""} placeholder="Mars 2021" onChange={(e) => updateExp(i, { startDate: e.target.value || null })} />}
                </Field>
                <Field id={`exp-${i}-end`} label="Fin">
                  {(a) => (
                    <Input
                      {...a}
                      value={x.isCurrent ? "" : x.endDate ?? ""}
                      disabled={x.isCurrent}
                      placeholder={x.isCurrent ? "En poste" : "2023"}
                      onChange={(e) => updateExp(i, { endDate: e.target.value || null })}
                    />
                  )}
                </Field>
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-[var(--emerald)]" checked={x.isCurrent} onChange={(e) => updateExp(i, { isCurrent: e.target.checked })} />
                  Poste actuel
                </label>
                <Field id={`exp-${i}-loc`} label="Lieu">
                  {(a) => <Input {...a} value={x.location ?? ""} onChange={(e) => updateExp(i, { location: e.target.value || null })} />}
                </Field>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`exp-${i}-ach`}>Réalisations</Label>
                <textarea
                  id={`exp-${i}-ach`}
                  className={textareaClass}
                  value={x.achievements.join("\n")}
                  onChange={(e) => updateExp(i, { achievements: e.target.value.split("\n") })}
                />
              </div>
              <div className="flex items-start justify-between gap-4">
                <Evidence text={x.evidence} />
                <Button type="button" variant="ghost" size="sm" onClick={() => setExperiences((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 />
                  Retirer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <PanelHeader
          title={`Compétences (${keptCount} retenue${keptCount > 1 ? "s" : ""})`}
          description="Décochez celles que vous ne souhaitez pas mettre en avant. Celles que vous ajoutez sont marquées comme saisies par vous."
        />
        <PanelBody className="grid gap-4">
          <ul className="flex flex-wrap gap-2">
            {skills.map((s, i) => (
              <li key={s.name}>
                <label
                  title={s.evidence === USER_EVIDENCE ? "Saisie par vous" : `Trouvée dans : ${s.evidence}`}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors",
                    s.kept ? "border-emerald/40 bg-emerald-wash" : "border-line text-muted line-through",
                  )}
                >
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--emerald)]"
                    checked={s.kept}
                    onChange={() => setSkills((xs) => xs.map((x, j) => (j === i ? { ...x, kept: !x.kept } : x)))}
                  />
                  {s.evidence === USER_EVIDENCE ? <ConfidenceMark level="inferred" className="size-2.5" /> : null}
                  {s.name}
                </label>
              </li>
            ))}
          </ul>
          <div className="flex max-w-md gap-2">
            <Input
              aria-label="Ajouter une compétence"
              placeholder="Ajouter une compétence"
              value={newSkill}
              onChange={(e) => setNewSkill(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSkill();
                }
              }}
              maxLength={120}
            />
            <Button type="button" variant="secondary" onClick={addSkill}>
              Ajouter
            </Button>
          </div>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Formation"
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => setEducation((xs) => [...xs, { degree: "", institution: null, year: null, evidence: USER_EVIDENCE }])}>
                <Plus />
                Ajouter
              </Button>
            }
          />
          <ul className="divide-y divide-line">
            {education.length === 0 ? <li className="px-5 py-4 text-sm text-muted">Aucune formation identifiée.</li> : null}
            {education.map((e, i) => (
              <li key={i} className="grid gap-3 px-5 py-4">
                <Field id={`edu-${i}-degree`} label="Diplôme">
                  {(a) => <Input {...a} value={e.degree} onChange={(ev) => updateEdu(i, { degree: ev.target.value })} />}
                </Field>
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  <Field id={`edu-${i}-inst`} label="Établissement">
                    {(a) => <Input {...a} value={e.institution ?? ""} onChange={(ev) => updateEdu(i, { institution: ev.target.value || null })} />}
                  </Field>
                  <Field id={`edu-${i}-year`} label="Année">
                    {(a) => <Input {...a} value={e.year ?? ""} onChange={(ev) => updateEdu(i, { year: ev.target.value || null })} />}
                  </Field>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <Evidence text={e.evidence} />
                  <Button type="button" variant="ghost" size="sm" onClick={() => setEducation((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 />
                    Retirer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelHeader
            title="Langues"
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => setLanguages((xs) => [...xs, { name: "", level: null, evidence: USER_EVIDENCE }])}>
                <Plus />
                Ajouter
              </Button>
            }
          />
          <ul className="divide-y divide-line">
            {languages.length === 0 ? <li className="px-5 py-4 text-sm text-muted">Aucune langue identifiée.</li> : null}
            {languages.map((l, i) => (
              <li key={i} className="flex items-end gap-3 px-5 py-4">
                <Field id={`lang-${i}-name`} label="Langue">
                  {(a) => <Input {...a} value={l.name} onChange={(e) => updateLang(i, { name: e.target.value })} />}
                </Field>
                <Field id={`lang-${i}-level`} label="Niveau">
                  {(a) => <Input {...a} value={l.level ?? ""} onChange={(e) => updateLang(i, { level: e.target.value || null })} />}
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label={`Retirer ${l.name || "cette langue"}`} onClick={() => setLanguages((xs) => xs.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel>
        <PanelBody className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <Field id="label" label="Nom de cette version" hint="Par exemple : « Version anglaise » ou « Orientée management ».">
            {(a) => <Input {...a} name="label" defaultValue={defaultLabel} maxLength={200} className="sm:w-72" />}
          </Field>
        </PanelBody>
      </Panel>

      <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-panel sm:border sm:px-5">
        {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
        <div className="flex flex-wrap items-center gap-3">
          <SubmitButton pendingLabel="Enregistrement…" className="w-full sm:w-auto">
            Valider ce profil
          </SubmitButton>
          <p className="hidden text-xs text-muted sm:ml-auto sm:block sm:max-w-sm">
            Seules les informations validées ici seront utilisées pour analyser les offres.
          </p>
        </div>
      </div>
    </form>
  );
}

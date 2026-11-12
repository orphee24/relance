import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toIcs, type CalendarItem } from "@/server/applications/export";

export const dynamic = "force-dynamic";

/** Rappels et prochaines actions à venir, au format iCalendar (import ponctuel dans un agenda). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: reminders }, { data: apps }] = await Promise.all([
    supabase.from("reminders").select("id, title, due_at, applications(company_name, job_title)").is("completed_at", null).gte("due_at", since).limit(500),
    supabase.from("applications").select("id, company_name, job_title, next_action, next_action_at").is("archived_at", null).gte("next_action_at", since).limit(500),
  ]);

  const items: CalendarItem[] = [
    ...(reminders ?? []).map((r) => {
      const a = Array.isArray(r.applications) ? r.applications[0] : r.applications;
      return { uid: `reminder-${r.id}`, title: r.title, description: a ? `${a.job_title} — ${a.company_name}` : null, start: r.due_at };
    }),
    ...(apps ?? []).map((a) => ({
      uid: `next-action-${a.id}-${a.next_action_at}`,
      title: `${a.next_action ?? "Prochaine action"} — ${a.company_name}`,
      description: a.job_title,
      start: a.next_action_at!,
    })),
  ];

  return new NextResponse(toIcs(items), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="relance-agenda.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}

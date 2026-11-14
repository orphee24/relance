import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "resumes";

/** Liste récursivement les fichiers d'un dossier du stockage. */
async function listFiles(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`storage list: ${error.message}`);
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      // Un dossier n'a pas d'identifiant dans l'API de stockage.
      if (item.id === null) out.push(...(await listFiles(admin, path)));
      else out.push(path);
    }
    if (!data || data.length < 100) break;
  }
  return out;
}

export interface DeletionReport {
  processed: number;
  failed: number;
  filesRemoved: number;
}

/**
 * Traite les demandes de suppression :
 * 1. réservation atomique (pas de double traitement) ;
 * 2. suppression des fichiers (CV originaux) ;
 * 3. suppression du compte d'authentification : toutes les données personnelles suivent par cascade,
 *    les paiements sont conservés anonymisés (user_id → null) pour les obligations comptables ;
 * 4. clôture de la demande et journal d'audit (identifiant pseudonyme, aucun contenu).
 * Une demande en échec reste « en cours » et est reprise automatiquement une heure plus tard.
 */
export async function processDeletionRequests(admin: SupabaseClient, limit = 20): Promise<DeletionReport> {
  const report: DeletionReport = { processed: 0, failed: 0, filesRemoved: 0 };
  const { data: claimed, error } = await admin.rpc("claim_deletion_requests", { p_limit: limit });
  if (error) throw new Error(`claim_deletion_requests: ${error.message}`);

  for (const req of (claimed ?? []) as { id: string; user_id: string }[]) {
    try {
      const files = await listFiles(admin, req.user_id);
      for (let i = 0; i < files.length; i += 100) {
        const { error: rmError } = await admin.storage.from(BUCKET).remove(files.slice(i, i + 100));
        if (rmError) throw new Error(`storage remove: ${rmError.message}`);
      }
      const { error: delError } = await admin.auth.admin.deleteUser(req.user_id);
      // Compte déjà supprimé : on termine quand même la demande.
      if (delError && delError.status !== 404) throw new Error(`deleteUser: ${delError.message}`);
      const { error: doneError } = await admin.rpc("complete_deletion_request", {
        p_id: req.id,
        p_files_removed: files.length,
      });
      if (doneError) throw new Error(`complete_deletion_request: ${doneError.message}`);
      report.processed += 1;
      report.filesRemoved += files.length;
    } catch (e) {
      report.failed += 1;
      console.error("[deletion] échec", req.id, e instanceof Error ? e.message : e);
    }
  }
  return report;
}

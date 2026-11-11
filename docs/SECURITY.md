# RELANCE — Sécurité et RGPD

## 1. Modèle de menace (résumé)

| Menace | Mesure |
|---|---|
| Accès aux données d'un autre utilisateur | RLS sur toutes les tables personnelles ; `user_id = auth.uid()` ; autorisation revérifiée côté serveur |
| Vol de session | Cookies httpOnly gérés par `@supabase/ssr`, rafraîchissement via middleware, `getUser()` (vérifié par le serveur Auth) et jamais `getSession()` pour autoriser |
| Injection SQL | Client Supabase paramétré ; aucune concaténation SQL ; fonctions SQL `security definer` limitées avec `search_path` fixé |
| Prompt injection via CV/offre | Contenu encapsulé et déclaré non fiable ; sorties strictement validées par Zod ; le LLM n'a accès à aucun outil ni donnée d'un autre utilisateur ; aucun effet de bord déclenché directement par une sortie LLM |
| Abus du module réseau | Quotas, pas d'énumération, « Ne plus contacter », journal d'audit |
| Webhooks falsifiés | Vérification de signature Stripe (`constructEvent`) sur le corps brut ; idempotence par `event.id` |
| Fuite de secrets | Secrets uniquement en variables d'environnement ; `SUPABASE_SERVICE_ROLE_KEY` utilisée seulement dans `src/server` (`server-only`) ; `.env*` ignorés par git |
| Brute force / spam | Rate limiting Supabase Auth + limiteur applicatif sur routes sensibles (IA, réseau, auth) |
| Upload malveillant | Types limités (PDF, DOCX), taille ≤ 5 Mo, bucket privé, chemin `user_id/…`, URLs signées courtes |
| XSS | Rendu React échappé ; aucun `dangerouslySetInnerHTML` sur contenu utilisateur ; en-têtes CSP |

## 2. En-têtes HTTP

Définis dans `next.config.ts` : `Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restrictive, `Strict-Transport-Security` en production.

## 3. Journalisation

- Pas de contenu de CV, de message, d'email ou de token dans les logs ni dans Sentry (`beforeSend` filtre `request.data`, cookies et en-têtes d'auth).
- `audit_logs` : actions sensibles (export, suppression, changement de plan, accès admin) avec identifiant d'acteur, type d'action, cible, horodatage — sans contenu.

## 4. RGPD

| Exigence | Mise en œuvre |
|---|---|
| Base légale | Contrat (service), consentement (import de contacts, emails marketing), intérêt légitime documenté pour données professionnelles publiques de tiers |
| Minimisation | Fiches de tiers limitées aux données professionnelles ; jamais de téléphone personnel ni d'email privé sans base légale |
| Information des tiers | Les tiers ne sont pas contactés par Relance ; l'utilisateur reste l'émetteur. Mention dans la politique de confidentialité |
| Droit d'accès / portabilité | Export JSON complet depuis Paramètres → Données |
| Droit à l'effacement | `deletion_requests` → suppression en cascade sous 30 jours max (immédiate pour les données applicatives, purge des sauvegardes selon le cycle de l'hébergeur) |
| Consentements | `consent_records` horodatés et versionnés (CGU, confidentialité, import de contacts, emails) |
| Rétention | CV et candidatures : durée du compte ; contacts tiers non rattachés : 12 mois ; logs d'audit : 12 mois ; données de paiement : obligations comptables (10 ans pour les pièces, hors données de carte jamais stockées) |
| Sous-traitants | Supabase (région UE), fournisseur LLM (DPA, pas d'entraînement sur les données), Stripe, Resend, Sentry (UE) |
| Admin | Aucun accès aux CV et messages privés depuis l'administration ; métriques agrégées uniquement |

## 5. Rôles

- `authenticated` : accès à ses seules lignes via RLS.
- `service_role` : jobs serveur et webhooks ; jamais exposé au client.
- `admin` : flag `user_profiles.is_admin` lu côté serveur ; donne accès aux vues agrégées, pas aux contenus.

## 6. Points à valider avant la production

- Analyse d'impact (AIPD) pour le module réseau (traitement de données de tiers).
- Revue juridique des CGV (droit de rétractation pour un service numérique fourni immédiatement : recueil de la renonciation expresse).
- Pentest externe.

# Déploiement

Cible : **Vercel** (fonctions en `fra1`, à côté de la base) + **Supabase** (`eu-central-1`) + **Stripe**.

## 1. Base de données (Supabase)

1. Projet en région UE. Appliquer `supabase/migrations/*.sql` dans l'ordre (CLI `supabase db push`, ou éditeur SQL).
2. Vérifier : *Advisors → Security*. Alertes attendues uniquement : tables réservées au serveur sans policy (`audit_logs`, `feature_flags`, `jobs`, `rate_limits`, `stripe_events`) et fonctions `security definer` appelables par les utilisateurs connectés (chacune contrôle l'appelant en interne).
3. *Authentication → URL Configuration* : Site URL = domaine final ; Redirect URLs : `https://<domaine>/auth/callback`, `https://<domaine>/auth/confirm`.
4. *Authentication → Emails* : modèles de confirmation et de réinitialisation (voir README §Supabase) ; SMTP dédié avant l'ouverture publique (l'envoi intégré est limité à quelques emails par heure).

## 2. Paiements (Stripe)

1. Recette en mode test (`sk_test_…`) ; la production n'utilise `sk_live_…` qu'après validation complète.
2. Webhook : `https://<domaine>/api/stripe/webhook`, événements `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`. Récupérer le secret `whsec_…`.

## 3. Hébergement (Vercel)

1. Importer le dépôt GitHub. `vercel.json` fixe la région `fra1` et la tâche quotidienne (03:17 UTC).
2. Variables d'environnement (Production et Preview) :

| Variable | Secret | Valeur |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | non | `https://<domaine>` |
| `NEXT_PUBLIC_SUPABASE_URL` | non | URL du projet |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | non | `sb_publishable_…` |
| `SUPABASE_SECRET_KEY` | **oui** | `sb_secret_…` |
| `ANTHROPIC_API_KEY` | **oui** | `sk-ant-…` |
| `AI_PROVIDER` / `AI_MODEL` | non | `anthropic` / `claude-sonnet-5-5` |
| `STRIPE_SECRET_KEY` | **oui** | `sk_test_…` en recette |
| `STRIPE_WEBHOOK_SECRET` | **oui** | `whsec_…` |
| `CRON_SECRET` | **oui** | 32+ caractères aléatoires |
| `SENTRY_DSN` | non | optionnel |

Les secrets se saisissent dans le tableau de bord Vercel (*Settings → Environment Variables*), jamais dans le dépôt ni dans une conversation.

3. Déployer, puis renseigner `NEXT_PUBLIC_SITE_URL` avec l'URL obtenue et redéployer.

## 4. Vérifications après déploiement

- [ ] Page d'accueil, `/connexion` : en-tête `Content-Security-Policy` avec `nonce-…`, aucune erreur console.
- [ ] Inscription → email reçu → lien → onboarding.
- [ ] Import d'un CV (PDF) → vérification → version enregistrée ; téléchargement de l'original.
- [ ] Analyse d'une offre (IA) → score expliqué ; quota décompté.
- [ ] Candidature créée, statut changé, export CSV.
- [ ] Achat d'un forfait avec la carte de test `4242 4242 4242 4242` → forfait actif ; remboursement depuis Stripe → accès retiré.
- [ ] Export RGPD téléchargé ; demande de suppression puis annulation ; nouvelle demande puis
      `curl -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/jobs/daily` → compte supprimé.
- [ ] Administrateur : `update public.user_profiles set is_admin = true where id = '<uuid>';` → `/admin`.

## 5. Avant l'ouverture au public

CGU et politique de confidentialité rédigées et validées juridiquement ; AIPD du module réseau ; SMTP dédié ; Sentry (UE) ; clés Stripe live ; revue de sécurité (`docs/SECURITY.md`).

import { expect, test } from "@playwright/test";

test.describe("Accès et protection des routes", () => {
  test("la page d'accueil présente la promesse et les marqueurs de fiabilité", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ne postulez plus dans le vide.");
    await expect(page.getByText("Hypothèse").first()).toBeVisible();
  });

  for (const path of ["/tableau-de-bord", "/candidatures", "/parametres", "/reseau", "/onboarding", "/cv", "/cv/00000000-0000-0000-0000-000000000000/verifier", "/analyser", "/analyser/00000000-0000-0000-0000-000000000000", "/candidatures/nouvelle", "/candidatures/00000000-0000-0000-0000-000000000000", "/reseau/nouveau", "/reseau/importer", "/reseau/00000000-0000-0000-0000-000000000000", "/entreprises", "/entreprises/00000000-0000-0000-0000-000000000000"]) {
    test(`${path} redirige un visiteur vers la connexion`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/connexion\\?next=${encodeURIComponent(path).replace(/%2F/g, "(%2F|/)")}`));
      await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    });
  }

  for (const url of ["/api/compte/export", "/api/cv/versions/00000000-0000-0000-0000-000000000000/pdf", "/api/cv/00000000-0000-0000-0000-000000000000/original", "/api/candidatures/export", "/api/candidatures/agenda.ics"]) {
    test(`${url} refuse un visiteur`, async ({ request }) => {
      const res = await request.get(url, { maxRedirects: 0 });
      expect([302, 307, 401]).toContain(res.status());
    });
  }

  test("les en-têtes de sécurité sont présents", async ({ request }) => {
    const res = await request.get("/");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("un lien de confirmation invalide renvoie vers la connexion avec un message", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=x&type=bogus&next=https://evil.example");
    await expect(page).toHaveURL(/\/connexion\?erreur=lien/);
    await expect(page.getByRole("alert").filter({ hasText: "n'est plus valide" })).toBeVisible();
  });
});

test.describe("Formulaires d'authentification", () => {
  test("l'inscription affiche les erreurs de validation en français", async ({ page }) => {
    await page.goto("/inscription");
    await page.getByLabel("Prénom").fill("Anne");
    await page.getByLabel("Nom", { exact: true }).fill("Durand");
    await page.getByLabel("Adresse email").fill("anne@exemple");
    await page.getByLabel("Mot de passe", { exact: true }).fill("court");
    await page.getByRole("button", { name: "Créer mon compte" }).click();

    await expect(page.getByText("Cette adresse email n'est pas valide.")).toBeVisible();
    await expect(page.getByText("Au moins 10 caractères.")).toBeVisible();
    await expect(page.getByText("Acceptez les conditions pour créer votre compte.")).toBeVisible();
    // Les valeurs non sensibles sont conservées, le mot de passe non.
    await expect(page.getByLabel("Prénom")).toHaveValue("Anne");
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("");
  });

  test("le mot de passe peut être affiché puis masqué", async ({ page }) => {
    await page.goto("/connexion");
    const input = page.getByLabel("Mot de passe", { exact: true });
    await input.fill("secret12345");
    await page.getByRole("button", { name: "Afficher le mot de passe" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Masquer le mot de passe" }).click();
    await expect(input).toHaveAttribute("type", "password");
  });

  test("une panne du service d'authentification affiche un message clair", async ({ page }) => {
    await page.goto("/connexion");
    await page.getByLabel("Adresse email").fill("anne@exemple.fr");
    await page.getByLabel("Mot de passe", { exact: true }).fill("motdepasse42");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "momentanément indisponible" })).toBeVisible();
  });

  test("la demande de réinitialisation valide l'email", async ({ page }) => {
    await page.goto("/mot-de-passe-oublie");
    await page.getByLabel("Adresse email").fill("pas-un-email");
    await page.getByRole("button", { name: "Recevoir un lien de réinitialisation" }).click();
    await expect(page.getByText("Cette adresse email n'est pas valide.")).toBeVisible();
  });
});

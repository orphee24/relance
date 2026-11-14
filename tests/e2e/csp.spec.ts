import { expect, test } from "@playwright/test";

test("la CSP utilise un nonce par requête et la page s'hydrate sans violation", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to (execute|load)/i.test(m.text())) violations.push(m.text());
  });
  const first = await page.goto("/connexion");
  const csp1 = first?.headers()["content-security-policy"] ?? "";
  expect(csp1).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp1).not.toMatch(/script-src[^;]*'unsafe-inline'/);

  // Interaction côté client : prouve que les scripts Next.js se sont exécutés.
  await page.getByRole("button", { name: /afficher le mot de passe/i }).click();
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveAttribute("type", "text");

  const second = await page.request.get("/connexion");
  expect(second.headers()["content-security-policy"]).not.toBe(csp1);
  expect(violations).toEqual([]);
});

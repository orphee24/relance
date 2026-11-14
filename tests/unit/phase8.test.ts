import { describe, expect, it } from "vitest";
import { buildCsp, createNonce } from "@/lib/security/csp";
import { rateKey, RATE_RULES } from "@/server/rate-limit";
import { redact, scrubEvent } from "@/server/observability/scrub";

describe("CSP", () => {
  it("n'autorise que les scripts portant le nonce en production", () => {
    const csp = buildCsp("abc", { isProd: true, supabaseUrl: "https://x.supabase.co/" });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(csp).toContain("connect-src 'self' https://x.supabase.co wss://x.supabase.co");
    expect(csp).toContain("frame-ancestors 'none'");
  });
  it("tolère une URL Supabase absente ou invalide", () => {
    expect(buildCsp("n", { isProd: false, supabaseUrl: "pas une url" })).toContain("connect-src 'self';");
  });
  it("génère des nonces différents", () => {
    expect(createNonce()).not.toBe(createNonce());
    expect(createNonce().length).toBeGreaterThanOrEqual(22);
  });
});

describe("limitation de débit", () => {
  it("ne stocke ni IP ni email en clair", () => {
    const k = rateKey(RATE_RULES.signInEmail, "Marie@Example.fr");
    expect(k).not.toContain("marie");
    expect(k).toMatch(/^signin-email:[0-9a-f]{40}$/);
    expect(rateKey(RATE_RULES.signInEmail, "marie@example.fr ")).toBe(k);
    expect(rateKey(RATE_RULES.signInIp, "marie@example.fr")).not.toBe(k);
  });
});

describe("nettoyage Sentry", () => {
  it("retire corps, cookies, utilisateur et masque emails et secrets", () => {
    const ev = scrubEvent({
      request: {
        data: "CV complet",
        cookies: "sb=1",
        url: "https://relance.fr/x?email=a@b.fr",
        headers: { authorization: "Bearer x", "user-agent": "UA" },
      },
      user: { email: "a@b.fr" },
      message: "échec pour jean@exemple.fr avec sk_test_ABCDEFGHIJKLMN",
      exception: { values: [{ value: "token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefghijklmnop" }] },
    });
    expect(ev.request?.data).toBeUndefined();
    expect(ev.request?.cookies).toBeUndefined();
    expect(ev.request?.url).toBe("https://relance.fr/x");
    expect(ev.request?.headers).toEqual({ "user-agent": "UA" });
    expect(ev.user).toBeUndefined();
    expect(ev.message).toBe("échec pour [email] avec [secret]");
    expect(ev.exception?.values?.[0]?.value).toBe("token [jwt]");
    expect(redact("rien")).toBe("rien");
  });
});

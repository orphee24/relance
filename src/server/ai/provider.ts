import "server-only";
import type { z } from "zod";
import { serverEnv } from "@/server/env";
import { toProviderJsonSchema } from "./json-schema";

export interface StructuredRequest<T> {
  /** Fonctionnalité, pour les quotas et l'usage (ex. "resume_parse"). */
  feature: string;
  system: string;
  /** Contenu déjà encapsulé avec wrapUntrusted(). */
  userContent: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
  readonly id: string;
  generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

export class AiError extends Error {
  constructor(
    public readonly code: "not_configured" | "timeout" | "http_error" | "refusal" | "truncated" | "invalid_output",
    message: string,
    public readonly usage?: { inputTokens: number; outputTokens: number },
  ) {
    super(message);
    this.name = "AiError";
  }
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Adaptateur Anthropic (Messages API, sorties JSON contraintes par schéma via `output_config.format`).
 * Aucun outil n'est fourni au modèle : il ne peut produire que du JSON, validé ensuite par Zod.
 */
export class AnthropicProvider implements LlmProvider {
  readonly id = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens ?? 4096,
          system: req.system,
          messages: [{ role: "user", content: req.userContent }],
          output_config: { format: { type: "json_schema", schema: toProviderJsonSchema(req.schema) } },
        }),
      });
    } catch (e) {
      throw new AiError(controller.signal.aborted ? "timeout" : "http_error", e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) throw new AiError("http_error", `Fournisseur IA : HTTP ${res.status}`);
    const body = (await res.json()) as AnthropicResponse;
    const usage = { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 };

    if (body.stop_reason === "refusal") throw new AiError("refusal", "Le modèle a refusé la demande.", usage);
    if (body.stop_reason === "max_tokens") throw new AiError("truncated", "Réponse tronquée.", usage);

    const text = body.content?.find((b) => b.type === "text")?.text;
    let json: unknown;
    try {
      json = JSON.parse(text ?? "");
    } catch {
      throw new AiError("invalid_output", "Réponse non JSON.", usage);
    }
    const parsed = req.schema.safeParse(json);
    if (!parsed.success) throw new AiError("invalid_output", "Réponse non conforme au schéma.", usage);

    return { data: parsed.data, provider: this.id, model: body.model ?? this.model, usage };
  }
}

export function getLlmProvider(): LlmProvider | null {
  const env = serverEnv();
  if (env.AI_PROVIDER !== "anthropic" || !env.ANTHROPIC_API_KEY) return null;
  return new AnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL, env.AI_TIMEOUT_MS);
}

export function estimateCostMicros(usage: { inputTokens: number; outputTokens: number }): number {
  const env = serverEnv();
  // € par million de jetons × jetons = micro-euros
  return Math.round(usage.inputTokens * env.AI_PRICE_INPUT_EUR_PER_MTOK + usage.outputTokens * env.AI_PRICE_OUTPUT_EUR_PER_MTOK);
}

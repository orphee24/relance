import { z } from "zod";

/** Mots-clés non pris en charge par les sorties structurées du fournisseur : retirés du schéma envoyé. */
const UNSUPPORTED = new Set(["minLength", "maxLength", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "minItems", "maxItems", "pattern", "default", "$schema", "format"]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (UNSUPPORTED.has(k)) continue;
    out[k] = k === "properties" ? Object.fromEntries(Object.entries(v as object).map(([pk, pv]) => [pk, clean(pv)])) : clean(v);
  }
  if (out.type === "object" && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as object);
  }
  return out;
}

/**
 * Convertit un schéma Zod en JSON Schema compatible avec les sorties contraintes.
 * Les contraintes retirées (longueurs, bornes) restent vérifiées par Zod à la réception.
 */
export function toProviderJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return clean(z.toJSONSchema(schema, { io: "output", target: "draft-2020-12" })) as Record<string, unknown>;
}

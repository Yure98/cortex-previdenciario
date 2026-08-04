import "server-only";

import { createHmac } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";

const resultSchema = z.object({
  permitido: z.boolean(),
  restantes: z.number().int().nonnegative(),
  tentar_novamente_em: z.number().int().nonnegative(),
});

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export function getClientIp(headers: Headers): string {
  const forwarded =
    headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for") ?? "unknown";
  return forwarded.split(",", 1)[0]!.trim().slice(0, 128) || "unknown";
}

export function hashRateLimitKey(scope: string, identifier: string, secret: string): string {
  if (secret.length < 32) throw new Error("RATE_LIMIT_HASH_SECRET_INVALIDO");
  return createHmac("sha256", secret)
    .update(scope)
    .update("\0")
    .update(identifier.trim().toLowerCase())
    .digest("hex");
}

export async function consumeRateLimit(input: {
  admin: SupabaseClient;
  scope: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
  secret?: string;
}): Promise<RateLimitResult> {
  const secret = input.secret ?? process.env.RATE_LIMIT_HASH_SECRET ?? "";
  const keyHash = hashRateLimitKey(input.scope, input.identifier, secret);
  const { data, error } = await input.admin.rpc("consumir_rate_limit", {
    p_escopo: input.scope,
    p_chave_hash: keyHash,
    p_limite: input.limit,
    p_janela_segundos: input.windowSeconds,
  });
  if (error) throw new Error("RATE_LIMIT_INDISPONIVEL", { cause: error });
  const row = resultSchema.parse(Array.isArray(data) ? data[0] : data);
  return {
    allowed: row.permitido,
    remaining: row.restantes,
    retryAfterSeconds: row.tentar_novamente_em,
  };
}

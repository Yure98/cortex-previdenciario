import "server-only";

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  APP_URL: z.string().url(),
  INTERNAL_PYTHON_TOKEN: z.string().min(32),
  PYTHON_DIAGNOSTICO_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE: z.string().min(1),
  ASAAS_API_KEY: z.string().min(1),
  ASAAS_WEBHOOK_TOKEN: z.string().min(32),
  ASAAS_ENVIRONMENT: z.literal("sandbox"),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  MODELO_SONNET: z.string().min(1),
  MODELO_HAIKU: z.string().min(1),
  LIMITE_GASTO_MENSAL_USD: z.coerce.number().positive(),
  LIMITE_CUSTO_PECA_BRL: z.coerce.number().positive().max(3),
  COTACAO_USD_BRL: z.coerce.number().positive(),
  PRECO_SONNET_INPUT_USD_MTOK: z.coerce.number().positive(),
  PRECO_SONNET_OUTPUT_USD_MTOK: z.coerce.number().positive(),
  PRECO_HAIKU_INPUT_USD_MTOK: z.coerce.number().positive(),
  PRECO_HAIKU_OUTPUT_USD_MTOK: z.coerce.number().positive(),
  VOYAGE_API_KEY: z.string().min(1),
  MODELO_EMBEDDING: z.literal("voyage-4"),
  PRECO_VOYAGE_INPUT_USD_MTOK: z.coerce.number().positive(),
  ENTREGA_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
});

const engineEnvironmentSchema = serverEnvironmentSchema.pick({
  APP_URL: true,
  INTERNAL_PYTHON_TOKEN: true,
  PYTHON_DIAGNOSTICO_URL: true,
  ANTHROPIC_API_KEY: true,
  SUPABASE_URL: true,
  SUPABASE_ANON_KEY: true,
  SUPABASE_SERVICE_ROLE: true,
  MODELO_SONNET: true,
  MODELO_HAIKU: true,
  LIMITE_GASTO_MENSAL_USD: true,
  LIMITE_CUSTO_PECA_BRL: true,
  COTACAO_USD_BRL: true,
  PRECO_SONNET_INPUT_USD_MTOK: true,
  PRECO_SONNET_OUTPUT_USD_MTOK: true,
  PRECO_HAIKU_INPUT_USD_MTOK: true,
  PRECO_HAIKU_OUTPUT_USD_MTOK: true,
  VOYAGE_API_KEY: true,
  MODELO_EMBEDDING: true,
  PRECO_VOYAGE_INPUT_USD_MTOK: true,
  ENTREGA_SIGNED_URL_TTL_SECONDS: true,
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;
export type EngineEnvironment = z.infer<typeof engineEnvironmentSchema>;
export type BillingEnvironment = Pick<ServerEnvironment, "ASAAS_API_KEY" | "ASAAS_WEBHOOK_TOKEN" | "ASAAS_ENVIRONMENT" | "APP_URL">;
export type NotificationEnvironment = Pick<ServerEnvironment, "RESEND_API_KEY" | "RESEND_FROM_EMAIL" | "APP_URL">;

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse(process.env);
}

export function getEngineEnvironment(): EngineEnvironment {
  return engineEnvironmentSchema.parse(process.env);
}

export function getBillingEnvironment(): BillingEnvironment {
  const env = serverEnvironmentSchema.pick({ ASAAS_API_KEY: true, ASAAS_WEBHOOK_TOKEN: true, ASAAS_ENVIRONMENT: true, APP_URL: true }).parse(process.env);
  return env;
}

export function getNotificationEnvironment(): NotificationEnvironment {
  return serverEnvironmentSchema.pick({ RESEND_API_KEY: true, RESEND_FROM_EMAIL: true, APP_URL: true }).parse(process.env);
}

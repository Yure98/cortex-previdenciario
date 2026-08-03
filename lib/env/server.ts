import "server-only";

import { z } from "zod";

const serverEnvironmentSchema = z.object({
  APP_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE: z.string().min(1),
  ASAAS_API_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  MODELO_SONNET: z.string().min(1),
  MODELO_HAIKU: z.string().min(1),
  LIMITE_GASTO_MENSAL_USD: z.coerce.number().positive(),
  LIMITE_CUSTO_PECA_BRL: z.coerce.number().positive().max(3),
  COTACAO_USD_BRL: z.coerce.number().positive(),
  VOYAGE_API_KEY: z.string().min(1),
  MODELO_EMBEDDING: z.literal("voyage-4"),
});

export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function getServerEnvironment(): ServerEnvironment {
  return serverEnvironmentSchema.parse(process.env);
}

import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

import { createSupabaseServerClient } from "@/lib/supabase/server";

const sessionContextSchema = z.object({
  usuario: z.object({
    id: z.string().uuid(),
    nome: z.string().nullable(),
    escritorio_id: z.string().uuid(),
  }),
  escritorio: z.object({
    id: z.string().uuid(),
    nome: z.string(),
    oab: z.string().nullable(),
    cidade: z.string().nullable(),
    status: z.enum(["onboarding", "ativo", "suspenso", "inadimplente", "cancelado"]),
    timbrado_path: z.string().nullable(),
    cor_primaria: z.string(),
    cor_secundaria: z.string(),
    cor_acento: z.string(),
    notebooklm_url: z.string().nullable(),
    data_onboarding: z.string().nullable(),
    franquia_pecas_mensal: z.number().int(),
  }),
});

export type SessionContext = z.infer<typeof sessionContextSchema>;

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return null;

  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select("id,nome,escritorio_id")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (usuarioError || !usuario) return null;

  const { data: escritorio, error: escritorioError } = await supabase
    .from("escritorios")
    .select(
      "id,nome,oab,cidade,status,timbrado_path,cor_primaria,cor_secundaria,cor_acento,notebooklm_url,data_onboarding,franquia_pecas_mensal",
    )
    .eq("id", usuario.escritorio_id)
    .maybeSingle();
  if (escritorioError || !escritorio) return null;

  return sessionContextSchema.parse({ usuario, escritorio });
});

export async function requireSessionContext(): Promise<SessionContext> {
  const context = await getSessionContext();
  if (!context) redirect("/entrar");
  return context;
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod/v4";

import { consumeRateLimit, getClientIp } from "@/lib/security/rate-limit";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; success?: string };

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

async function enforceAuthRateLimit(email: string, action: string): Promise<string | null> {
  try {
    const requestHeaders = await headers();
    const admin = createSupabaseAdminClient();
    const [ipLimit, emailLimit] = await Promise.all([
      consumeRateLimit({
        admin,
        scope: `auth:${action}:ip`,
        identifier: getClientIp(requestHeaders),
        limit: 10,
        windowSeconds: 600,
      }),
      consumeRateLimit({
        admin,
        scope: `auth:${action}:email`,
        identifier: email,
        limit: 5,
        windowSeconds: 900,
      }),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      return "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.";
    }
    return null;
  } catch {
    // Autenticação falha fechada se a proteção distribuída estiver indisponível.
    return "Não foi possível validar a tentativa agora. Tente novamente em alguns minutos.";
  }
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const rateLimitError = await enforceAuthRateLimit(parsed.data.email, "signin");
  if (rateLimitError) return { error: rateLimitError };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.senha,
  });
  if (error) return { error: "E-mail ou senha inválidos." };
  redirect("/portal");
}

const signUpSchema = credentialsSchema.extend({
  nome: z.string().trim().min(2, "Informe seu nome."),
  escritorio: z.string().trim().min(2, "Informe o nome do escritório."),
});

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const rateLimitError = await enforceAuthRateLimit(parsed.data.email, "signup");
  if (rateLimitError) return { error: rateLimitError };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.senha,
    options: {
      emailRedirectTo: `${process.env.APP_URL ?? "http://localhost:3000"}/auth/callback`,
      data: { nome: parsed.data.nome, escritorio_nome: parsed.data.escritorio },
    },
  });
  if (error) return { error: "Não foi possível criar a conta. Verifique o e-mail informado." };
  return { success: "Conta criada. Confira seu e-mail para confirmar o acesso." };
}

export async function requestPasswordReset(
  _: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = z.object({ email: z.string().email() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Informe um e-mail válido." };
  const rateLimitError = await enforceAuthRateLimit(parsed.data.email, "password_reset");
  if (rateLimitError) return { error: rateLimitError };
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.APP_URL ?? "http://localhost:3000"}/auth/callback?next=/redefinir-senha`,
  });
  return { success: "Se o e-mail estiver cadastrado, enviaremos as instruções." };
}

export async function updatePassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres.") })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.senha });
  if (error) return { error: "O link expirou. Solicite uma nova recuperação." };
  return { success: "Senha atualizada. Você já pode acessar o portal." };
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/entrar");
}

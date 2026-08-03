"use server";

import { redirect } from "next/navigation";
import { z } from "zod/v4";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; success?: string };

const credentialsSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  senha: z.string().min(8, "A senha precisa ter ao menos 8 caracteres."),
});

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
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


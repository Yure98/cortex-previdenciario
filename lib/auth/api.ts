import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ApiIdentity = {
  userId: string;
  email: string;
  escritorioId: string;
  papel: "proprietario" | "membro" | "platform_admin";
};

export async function getApiIdentity(): Promise<ApiIdentity | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) return null;

  const { data: profile, error: profileError } = await supabase
    .from("usuarios")
    .select("escritorio_id,papel")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile) return null;
  return {
    userId: data.user.id,
    email: data.user.email,
    escritorioId: profile.escritorio_id as string,
    papel: profile.papel as ApiIdentity["papel"],
  };
}

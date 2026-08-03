import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { getApiIdentity } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const identity = await getApiIdentity();
  if (!identity) return NextResponse.json({ erro: "Autenticação obrigatória." }, { status: 401 });
  const parsedId = z.string().uuid().safeParse((await context.params).id);
  if (!parsedId.success) return NextResponse.json({ erro: "Entrega inválida." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("entregas").select("arquivo_path").eq("id", parsedId.data).eq("escritorio_id", identity.escritorioId).maybeSingle();
  if (!data) return NextResponse.json({ erro: "Entrega não encontrada." }, { status: 404 });
  const ttl = Math.min(900, Math.max(60, Number(process.env.ENTREGA_SIGNED_URL_TTL_SECONDS ?? 300)));
  const { data: signed, error } = await admin.storage.from("entregas").createSignedUrl(data.arquivo_path, ttl, { download: true });
  if (error || !signed?.signedUrl) return NextResponse.json({ erro: "Não foi possível liberar o download." }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "cache-control": "no-store" } });
}

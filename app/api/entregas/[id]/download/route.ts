import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { getApiIdentity } from "@/lib/auth/api";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const identity = await getApiIdentity();
  if (!identity) {
    logWarn({ event: "delivery_download_unauthorized", route: "/api/entregas/[id]/download", request_id: requestId, status: 401 });
    return NextResponse.json({ erro: "Autenticação obrigatória." }, { status: 401 });
  }
  const parsedId = z.string().uuid().safeParse((await context.params).id);
  if (!parsedId.success) {
    logWarn({ event: "delivery_download_invalid", route: "/api/entregas/[id]/download", request_id: requestId, escritorio_id: identity.escritorioId, status: 400 });
    return NextResponse.json({ erro: "Entrega inválida." }, { status: 400 });
  }
  const admin = createSupabaseAdminClient();
  let query = admin.from("entregas").select("arquivo_path").eq("id", parsedId.data);
  if (identity.papel !== "platform_admin") query = query.eq("escritorio_id", identity.escritorioId);
  const { data } = await query.maybeSingle();
  if (!data) {
    logWarn({ event: "delivery_download_not_found", route: "/api/entregas/[id]/download", request_id: requestId, escritorio_id: identity.escritorioId, entrega_id: parsedId.data, status: 404 });
    return NextResponse.json({ erro: "Entrega não encontrada." }, { status: 404 });
  }
  const ttl = Math.min(900, Math.max(60, Number(process.env.ENTREGA_SIGNED_URL_TTL_SECONDS ?? 300)));
  const { data: signed, error } = await admin.storage.from("entregas").createSignedUrl(data.arquivo_path, ttl, { download: true });
  if (error || !signed?.signedUrl) {
    logError({ event: "delivery_download_failed", route: "/api/entregas/[id]/download", request_id: requestId, escritorio_id: identity.escritorioId, entrega_id: parsedId.data, status: 500, duration_ms: Date.now() - startedAt, error_type: error?.name ?? "StorageError" });
    return NextResponse.json({ erro: "Não foi possível liberar o download." }, { status: 500 });
  }
  logInfo({ event: "delivery_download_signed", route: "/api/entregas/[id]/download", request_id: requestId, escritorio_id: identity.escritorioId, entrega_id: parsedId.data, status: 302, duration_ms: Date.now() - startedAt });
  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "cache-control": "no-store" } });
}

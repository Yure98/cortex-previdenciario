import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { preflightTemplate } from "@/lib/docx/preflight";
import { getApiIdentity } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { provisionOfficeBilling } from "@/lib/billing/provisioning";
import { sendOfficeNotification } from "@/lib/notifications/email";
import { assertUpload, DOCX_MIME, hasSameOrigin, hasZipSignature, MAX_UPLOAD_BYTES, onboardingSchema } from "@/lib/portal/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return response({ erro: "Origem da requisição não permitida." }, 403);
  const identity = await getApiIdentity();
  if (!identity) return response({ erro: "Autenticação obrigatória." }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64_000) return response({ erro: "Arquivo acima de 50 MB." }, 413);

  let uploadedPath: string | null = null;
  try {
    const form = await request.formData();
    const template = form.get("timbrado");
    if (!(template instanceof File)) return response({ erro: "Envie o timbrado em DOCX." }, 400);
    assertUpload(template, "docx");
    const parsed = onboardingSchema.parse({
      nome: form.get("nome"), nomeUsuario: form.get("nomeUsuario"), oab: form.get("oab") || undefined,
      cidade: form.get("cidade") || undefined, notebooklmUrl: form.get("notebooklmUrl") ?? "",
      corPrimaria: form.get("corPrimaria"), corSecundaria: form.get("corSecundaria"), corAcento: form.get("corAcento"),
    });
    const buffer = Buffer.from(await template.arrayBuffer());
    if (!hasZipSignature(buffer)) return response({ erro: "O arquivo não é um DOCX válido." }, 400);
    const preflight = await preflightTemplate(buffer);

    const admin = createSupabaseAdminClient();
    const { data: previous } = await admin.from("escritorios").select("timbrado_path").eq("id", identity.escritorioId).maybeSingle();
    uploadedPath = `${identity.escritorioId}/${randomUUID()}/timbrado.docx`;
    const { error: uploadError } = await admin.storage.from("timbrados").upload(uploadedPath, buffer, { contentType: DOCX_MIME, upsert: false });
    if (uploadError) throw uploadError;

    const { error: userError } = await admin.from("usuarios").update({ nome: parsed.nomeUsuario }).eq("id", identity.userId).eq("escritorio_id", identity.escritorioId);
    if (userError) throw userError;
    const { error: officeError } = await admin.from("escritorios").update({
      nome: parsed.nome, oab: parsed.oab || null, cidade: parsed.cidade || null,
      notebooklm_url: parsed.notebooklmUrl || null, cor_primaria: parsed.corPrimaria,
      cor_secundaria: parsed.corSecundaria, cor_acento: parsed.corAcento,
      timbrado_path: uploadedPath, status: "onboarding", data_onboarding: new Date().toISOString(),
    }).eq("id", identity.escritorioId);
    if (officeError) throw officeError;
    await provisionOfficeBilling({ escritorioId: identity.escritorioId, officeName: parsed.nome, email: identity.email, admin });
    if (previous?.timbrado_path && previous.timbrado_path !== uploadedPath) await admin.storage.from("timbrados").remove([previous.timbrado_path]);
    await sendOfficeNotification({ kind: "onboarding_concluido", escritorioId: identity.escritorioId, admin });

    return response({ ok: true, cobranca: "setup_pendente", ambiente: "sandbox", avisos: preflight.report.warnings });
  } catch (error) {
    if (uploadedPath) await createSupabaseAdminClient().storage.from("timbrados").remove([uploadedPath]);
    const message = error instanceof Error && error.message.startsWith("ARQUIVO_") ? "O timbrado deve ser um DOCX válido de até 50 MB." : "Não foi possível validar e salvar o timbrado.";
    return response({ erro: message }, 400);
  }
}

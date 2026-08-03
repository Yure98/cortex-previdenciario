import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getApiIdentity } from "@/lib/auth/api";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertUpload, hasPdfSignature, hasSameOrigin, MAX_UPLOAD_BYTES, newCaseSchema, PDF_MIME } from "@/lib/portal/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return response({ erro: "Origem da requisição não permitida." }, 403);
  const identity = await getApiIdentity();
  if (!identity) return response({ erro: "Autenticação obrigatória." }, 401);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 128_000) return response({ erro: "Arquivo acima de 50 MB." }, 413);

  const admin = createSupabaseAdminClient();
  let caseId: string | null = null;
  let storagePath: string | null = null;
  try {
    const { data: office } = await admin.from("escritorios").select("status,timbrado_path").eq("id", identity.escritorioId).maybeSingle();
    if (!office || office.status !== "ativo" || !office.timbrado_path) return response({ erro: "Conclua o onboarding antes de criar um caso." }, 409);
    const form = await request.formData();
    const cnis = form.get("cnis");
    if (!(cnis instanceof File)) return response({ erro: "Envie o CNIS em PDF." }, 400);
    assertUpload(cnis, "pdf");
    const parsed = newCaseSchema.parse({
      clienteFinal: form.get("clienteFinal"), beneficio: form.get("beneficio"), tipoPeca: form.get("tipoPeca"),
      fatos: form.get("fatos"), pedidos: form.get("pedidos"), pesquisouJuris: form.get("pesquisouJuris"), formato: form.get("formato"),
    });
    const buffer = Buffer.from(await cnis.arrayBuffer());
    if (!hasPdfSignature(buffer)) return response({ erro: "O arquivo não possui assinatura PDF válida." }, 400);
    const pedidos = parsed.pedidos.split(/\r?\n/).map((item) => item.replace(/^[-•\s]+/, "").trim()).filter(Boolean);

    const { data: created, error: caseError } = await admin.from("casos").insert({
      escritorio_id: identity.escritorioId, cliente_final: parsed.clienteFinal, beneficio: parsed.beneficio,
      tipo_peca: parsed.tipoPeca, formato: parsed.formato, pesquisou_juris: parsed.pesquisouJuris === "sim",
      fatos: parsed.fatos, pedidos, inputs: {},
    }).select("id").single();
    if (caseError || !created) throw caseError ?? new Error("CASO_NAO_CRIADO");
    caseId = created.id as string;
    storagePath = `${identity.escritorioId}/${caseId}/${randomUUID()}-cnis.pdf`;
    const { error: uploadError } = await admin.storage.from("cnis").upload(storagePath, buffer, { contentType: PDF_MIME, upsert: false });
    if (uploadError) throw uploadError;
    const { error: documentError } = await admin.from("documentos").insert({
      escritorio_id: identity.escritorioId, caso_id: caseId, tipo: "cnis", arquivo_path: storagePath,
      nome_original: cnis.name.slice(0, 240), mime_type: PDF_MIME, tamanho_bytes: buffer.length,
      criado_por: identity.userId,
    });
    if (documentError) throw documentError;
    return response({ ok: true, casoId: caseId }, 201);
  } catch {
    if (storagePath) await admin.storage.from("cnis").remove([storagePath]);
    if (caseId) await admin.from("casos").delete().eq("id", caseId).eq("escritorio_id", identity.escritorioId);
    return response({ erro: "Não foi possível criar o caso. Revise os dados e o CNIS." }, 400);
  }
}

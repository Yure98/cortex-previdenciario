import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { getBillingEnvironment } from "@/lib/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidWebhookToken, parseKnownAsaasEvent, processAsaasEvent } from "@/lib/billing/webhook";
import { sendOfficeNotification } from "@/lib/notifications/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request) {
  try {
    const env = getBillingEnvironment();
    if (!isValidWebhookToken(request.headers.get("asaas-access-token"), env.ASAAS_WEBHOOK_TOKEN)) return json({ erro: "Token inválido." }, 401);
    if (Number(request.headers.get("content-length") ?? 0) > 256_000) return json({ erro: "Payload excede o limite." }, 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 256_000) return json({ erro: "Payload excede o limite." }, 413);
    const event = parseKnownAsaasEvent(JSON.parse(raw));
    if (!event) return json({ ok: true, resultado: "ignorado" });
    const admin = createSupabaseAdminClient();
    const result = await processAsaasEvent({ event, payloadHash: createHash("sha256").update(raw).digest("hex"), admin });
    if (event.event === "PAYMENT_OVERDUE" && result === "processado") {
      const { data } = await admin.from("faturas").select("escritorio_id").eq("asaas_payment_id", event.payment.id).maybeSingle();
      if (data) await sendOfficeNotification({ kind: "fatura_vencida", escritorioId: data.escritorio_id, admin });
    }
    return json({ ok: true, resultado: result });
  } catch {
    return json({ erro: "Falha interna ao processar o evento." }, 500);
  }
}

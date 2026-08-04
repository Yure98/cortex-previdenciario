import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { getApiIdentity } from "@/lib/auth/api";
import { AsaasClient } from "@/lib/billing/asaas";
import { parseKnownAsaasEvent, processAsaasEvent } from "@/lib/billing/webhook";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSameOrigin } from "@/lib/portal/validation";

export const runtime = "nodejs";
const schema = z.object({ dias: z.number().int().min(1).max(90).default(30) });
const eventByStatus: Record<string, string> = { CONFIRMED: "PAYMENT_CONFIRMED", RECEIVED: "PAYMENT_RECEIVED", RECEIVED_IN_CASH: "PAYMENT_RECEIVED", OVERDUE: "PAYMENT_OVERDUE", REFUNDED: "PAYMENT_REFUNDED", REFUND_REQUESTED: "PAYMENT_REFUNDED", DELETED: "PAYMENT_DELETED" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return json({ erro: "Origem não permitida." }, 403);
  const identity = await getApiIdentity();
  if (!identity) return json({ erro: "Autenticação obrigatória." }, 401);
  if (identity.papel !== "platform_admin") return json({ erro: "Acesso restrito." }, 403);
  try {
    const { dias } = schema.parse(await request.json().catch(() => ({})));
    const since = new Date(); since.setUTCDate(since.getUTCDate() - dias);
    const asaas = new AsaasClient();
    const admin = createSupabaseAdminClient();
    const [payments, subscriptions] = await Promise.all([asaas.listPaymentsSince(since.toISOString().slice(0, 10)), asaas.listSubscriptions()]);
    let processed = 0;
    for (const payment of payments) {
      const eventName = eventByStatus[payment.status];
      if (!eventName) continue;
      const payload = { id: `reconcile:${payment.id}:${payment.status}`, event: eventName, payment: { id: payment.id } };
      const event = parseKnownAsaasEvent(payload);
      if (!event) continue;
      const raw = JSON.stringify(payload);
      const result = await processAsaasEvent({ event, payloadHash: createHash("sha256").update(raw).digest("hex"), admin, asaas });
      if (result === "processado") processed += 1;
    }
    for (const subscription of subscriptions) {
      const status = subscription.status === "ACTIVE" ? "ativa" : "cancelada";
      await admin.from("assinaturas").update({ status }).eq("asaas_subscription_id", subscription.id);
    }
    await admin.from("auditoria").insert({ escritorio_id: identity.escritorioId, evento: "cobranca.reconciliacao", autor: "platform_admin", metadata: { dias, pagamentos_processados: processed, assinaturas_consultadas: subscriptions.length } });
    return json({ ok: true, pagamentos_consultados: payments.length, pagamentos_processados: processed, assinaturas_consultadas: subscriptions.length });
  } catch {
    return json({ erro: "Falha na reconciliação com o sandbox Asaas." }, 500);
  }
}

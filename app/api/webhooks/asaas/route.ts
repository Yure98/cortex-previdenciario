import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getBillingEnvironment } from "@/lib/env/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidWebhookToken, parseKnownAsaasEvent, processAsaasEvent } from "@/lib/billing/webhook";
import { sendOfficeNotification } from "@/lib/notifications/email";
import { logError, logInfo, logWarn } from "@/lib/observability/logger";
import { consumeRateLimit, getClientIp } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extraHeaders,
    },
  });
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const traceId = randomUUID();
  let providerEventType: string | undefined;
  try {
    const env = getBillingEnvironment();
    if (!isValidWebhookToken(request.headers.get("asaas-access-token"), env.ASAAS_WEBHOOK_TOKEN)) {
      logWarn({
        event: "asaas_webhook_unauthorized",
        route: "/api/webhooks/asaas",
        request_id: traceId,
        status: 401,
      });
      return json({ erro: "Token inválido." }, 401);
    }
    const admin = createSupabaseAdminClient();
    const rateLimit = await consumeRateLimit({
      admin,
      scope: "api:webhook:asaas:ip",
      identifier: getClientIp(request.headers),
      limit: 120,
      windowSeconds: 60,
    });
    if (!rateLimit.allowed) {
      logWarn({
        event: "asaas_webhook_rate_limited",
        route: "/api/webhooks/asaas",
        request_id: traceId,
        status: 429,
        retry_after_seconds: rateLimit.retryAfterSeconds,
      });
      return json(
        { erro: "Muitas requisições." },
        429,
        { "retry-after": String(rateLimit.retryAfterSeconds) },
      );
    }
    if (Number(request.headers.get("content-length") ?? 0) > 256_000) return json({ erro: "Payload excede o limite." }, 413);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 256_000) return json({ erro: "Payload excede o limite." }, 413);
    const event = parseKnownAsaasEvent(JSON.parse(raw));
    if (!event) return json({ ok: true, resultado: "ignorado" });
    providerEventType = event.event;
    const result = await processAsaasEvent({ event, payloadHash: createHash("sha256").update(raw).digest("hex"), admin });
    if (event.event === "PAYMENT_OVERDUE" && result === "processado") {
      const { data } = await admin.from("faturas").select("escritorio_id").eq("asaas_payment_id", event.payment.id).maybeSingle();
      if (data) await sendOfficeNotification({ kind: "fatura_vencida", escritorioId: data.escritorio_id, admin });
    }
    logInfo({
      event: "asaas_webhook_processed",
      route: "/api/webhooks/asaas",
      request_id: traceId,
      provider_event_type: event.event,
      result,
      status: 200,
      duration_ms: Date.now() - startedAt,
    });
    return json({ ok: true, resultado: result });
  } catch (error) {
    logError({
      event: "asaas_webhook_failed",
      route: "/api/webhooks/asaas",
      request_id: traceId,
      provider_event_type: providerEventType,
      status: 500,
      duration_ms: Date.now() - startedAt,
      error_type: error instanceof Error ? error.name : "UnknownError",
    });
    return json({ erro: "Falha interna ao processar o evento." }, 500);
  }
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logError, logWarn, type SafeLogContext } from "@/lib/observability/logger";
import { consumeRateLimit } from "@/lib/security/rate-limit";

type OperationalAlert = Pick<
  SafeLogContext,
  "event" | "request_id" | "caso_id" | "escritorio_id" | "geracao_id" | "code" | "spend_ratio"
>;

export async function sendOperationalAlert(
  alert: OperationalAlert,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const to = process.env.OPS_ALERT_EMAIL;
  if (!to) return;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("RESEND_ALERT_ENV_INCOMPLETO");
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[Córtex] Alerta operacional: ${alert.event}`,
      text: JSON.stringify({ service: "cortex-previdenciario", ...alert }, null, 2),
      tags: [{ name: "event", value: alert.event.slice(0, 256) }],
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`RESEND_ALERT_HTTP_${response.status}`);
}

export async function recordGenerationFailure(input: {
  admin: SupabaseClient;
  requestId: string;
  casoId?: string;
  escritorioId?: string;
  geracaoId?: string;
  code: string;
}): Promise<void> {
  const context: OperationalAlert = {
    event: "generation_failed",
    request_id: input.requestId,
    caso_id: input.casoId,
    escritorio_id: input.escritorioId,
    geracao_id: input.geracaoId,
    code: input.code,
  };
  logError(context);
  try {
    const threshold = await consumeRateLimit({
      admin: input.admin,
      scope: "metric:generation_errors",
      identifier: "global",
      limit: 4,
      windowSeconds: 300,
    });
    if (threshold.allowed) return;
    const alertGate = await consumeRateLimit({
      admin: input.admin,
      scope: "alert:generation_errors",
      identifier: "global",
      limit: 1,
      windowSeconds: 3600,
    });
    if (alertGate.allowed) {
      await sendOperationalAlert({ ...context, event: "alert_generation_error_rate" });
    }
  } catch (error) {
    logWarn({
      event: "operational_alert_failed",
      code: "GENERATION_ERROR_RATE",
      error_type: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

export async function alertGlobalSpend(input: {
  admin: SupabaseClient;
  requestId: string;
  spendRatio: number;
}): Promise<void> {
  if (input.spendRatio < 0.8) return;
  const month = new Date().toISOString().slice(0, 7);
  const context: OperationalAlert = {
    event: "alert_global_spend_80",
    request_id: input.requestId,
    spend_ratio: input.spendRatio,
  };
  logWarn(context);
  try {
    const gate = await consumeRateLimit({
      admin: input.admin,
      scope: "alert:global_spend_80",
      identifier: month,
      limit: 1,
      windowSeconds: 86400,
    });
    if (gate.allowed) await sendOperationalAlert(context);
  } catch (error) {
    logWarn({
      event: "operational_alert_failed",
      code: "GLOBAL_SPEND_80",
      error_type: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

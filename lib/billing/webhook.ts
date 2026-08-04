import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";

import { AsaasClient } from "@/lib/billing/asaas";
import { asaasValueToCents } from "@/lib/billing/money";

const paymentEventSchema = z.enum(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_DELETED"]);
const knownEventSchema = z.union([
  z.object({ id: z.string().min(1).max(200), event: paymentEventSchema, payment: z.object({ id: z.string().min(1) }).passthrough() }),
  z.object({ id: z.string().min(1).max(200), event: z.literal("SUBSCRIPTION_DELETED"), subscription: z.object({ id: z.string().min(1) }).passthrough() }),
]);

export type KnownAsaasEvent = z.infer<typeof knownEventSchema>;

export function isValidWebhookToken(provided: string | null, expected: string): boolean {
  const actualHash = createHash("sha256").update(provided ?? "").digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}

export function parseKnownAsaasEvent(value: unknown): KnownAsaasEvent | null {
  const parsed = knownEventSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export async function processAsaasEvent(input: {
  event: KnownAsaasEvent;
  payloadHash: string;
  admin: SupabaseClient;
  asaas?: AsaasClient;
}): Promise<"processado" | "duplicado" | "ignorado"> {
  const { event, payloadHash, admin } = input;
  const asaas = input.asaas ?? new AsaasClient();
  const existing = await admin.from("webhook_eventos").select("id").eq("asaas_event_id", event.id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return "duplicado";
  let resourceId: string;
  let resourceStatus = "DELETED";
  let valueCents: number | null = null;
  let subscriptionId: string | null = null;
  let dueDate: string | null = null;
  let verifiedEventType: string = event.event;

  if ("payment" in event) {
    resourceId = event.payment.id;
    const verified = await asaas.getPayment(resourceId);
    resourceStatus = verified.status;
    valueCents = asaasValueToCents(verified.value);
    subscriptionId = verified.subscription ?? null;
    dueDate = verified.dueDate ?? null;
    verifiedEventType = ({ CONFIRMED: "PAYMENT_CONFIRMED", RECEIVED: "PAYMENT_RECEIVED", RECEIVED_IN_CASH: "PAYMENT_RECEIVED", OVERDUE: "PAYMENT_OVERDUE", REFUNDED: "PAYMENT_REFUNDED", REFUND_REQUESTED: "PAYMENT_REFUNDED", DELETED: "PAYMENT_DELETED" } as Record<string, string>)[verified.status] ?? `PAYMENT_STATUS_${verified.status}`;
  } else {
    resourceId = event.subscription.id;
  }

  const { data, error } = await admin.rpc("processar_evento_asaas", {
    p_event_id: event.id,
    p_event_type: verifiedEventType,
    p_payload_hash: payloadHash,
    p_resource_id: resourceId,
    p_resource_status: resourceStatus,
    p_valor_centavos: valueCents,
    p_subscription_id: subscriptionId,
    p_due_date: dueDate,
  });
  if (error) throw error;
  return z.enum(["processado", "duplicado", "ignorado"]).parse(data);
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";

import { AsaasClient } from "@/lib/billing/asaas";

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function daysFromNow(days: number) { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return isoDate(date); }

export async function provisionOfficeBilling(input: { escritorioId: string; officeName: string; email: string; admin: SupabaseClient; asaas?: AsaasClient }) {
  const { escritorioId, officeName, email, admin } = input;
  const asaas = input.asaas ?? new AsaasClient();
  const { data: office, error: officeError } = await admin.from("escritorios").select("asaas_customer_id,valor_setup_centavos,dias_ate_primeira_mensalidade").eq("id", escritorioId).single();
  if (officeError || !office) throw officeError ?? new Error("ESCRITORIO_NAO_ENCONTRADO");

  let customerId = z.string().nullable().parse(office.asaas_customer_id);
  if (!customerId) {
    const externalReference = `escritorio:${escritorioId}`;
    const customer = await asaas.findCustomer(externalReference) ?? await asaas.createCustomer({ name: officeName, email, externalReference });
    customerId = customer.id;
    const { error } = await admin.from("escritorios").update({ asaas_customer_id: customerId }).eq("id", escritorioId);
    if (error) throw error;
  }

  let { data: setup } = await admin.from("faturas").select("id,asaas_payment_id").eq("escritorio_id", escritorioId).eq("tipo", "setup").maybeSingle();
  if (!setup) {
    const inserted = await admin.from("faturas").insert({ escritorio_id: escritorioId, tipo: "setup", status: "pendente", valor_centavos: office.valor_setup_centavos, vencimento: daysFromNow(0), metadata: { environment: "sandbox" } }).select("id,asaas_payment_id").single();
    if (inserted.error || !inserted.data) throw inserted.error ?? new Error("FATURA_SETUP_NAO_CRIADA");
    setup = inserted.data;
  }
  if (!setup.asaas_payment_id) {
    const externalReference = `fatura:${setup.id}`;
    const payment = await asaas.findPayment(externalReference) ?? await asaas.createPayment({ customer: customerId, cents: office.valor_setup_centavos, dueDate: daysFromNow(0), description: "Setup Córtex Previdenciário", externalReference });
    const { error } = await admin.from("faturas").update({ asaas_payment_id: payment.id, asaas_id: payment.id, metadata: { environment: "sandbox", invoice_url: payment.invoiceUrl ?? null } }).eq("id", setup.id);
    if (error) throw error;
  }

  let { data: subscription } = await admin.from("assinaturas").select("id,asaas_subscription_id").eq("escritorio_id", escritorioId).in("status", ["pendente", "ativa", "inadimplente"]).maybeSingle();
  const firstDueDate = daysFromNow(office.dias_ate_primeira_mensalidade);
  if (!subscription) {
    const inserted = await admin.from("assinaturas").insert({ escritorio_id: escritorioId, status: "pendente", inicio_cobranca: firstDueDate, proximo_vencimento: firstDueDate }).select("id,asaas_subscription_id").single();
    if (inserted.error || !inserted.data) throw inserted.error ?? new Error("ASSINATURA_NAO_CRIADA");
    subscription = inserted.data;
  }
  if (!subscription.asaas_subscription_id) {
    const externalReference = `assinatura:${subscription.id}`;
    const remote = await asaas.findSubscription(externalReference) ?? await asaas.createSubscription({ customer: customerId, cents: 39700, nextDueDate: firstDueDate, externalReference });
    const { error } = await admin.from("assinaturas").update({ asaas_subscription_id: remote.id, asaas_id: remote.id }).eq("id", subscription.id);
    if (error) throw error;
  }
}

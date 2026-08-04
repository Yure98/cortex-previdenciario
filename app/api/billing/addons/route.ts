import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { getApiIdentity } from "@/lib/auth/api";
import { AsaasClient } from "@/lib/billing/asaas";
import { addonPriceCents } from "@/lib/billing/money";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSameOrigin } from "@/lib/portal/validation";

export const runtime = "nodejs";
const schema = z.object({ quantidade: z.union([z.literal(1), z.literal(5), z.literal(10)]) });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });

export async function POST(request: Request) {
  if (!hasSameOrigin(request)) return json({ erro: "Origem não permitida." }, 403);
  const identity = await getApiIdentity();
  if (!identity) return json({ erro: "Autenticação obrigatória." }, 401);
  try {
    const { quantidade } = schema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    const { data: office, error } = await admin.from("escritorios").select("asaas_customer_id,valor_excedente_centavos,status").eq("id", identity.escritorioId).single();
    if (error || !office?.asaas_customer_id) return json({ erro: "Conclua o onboarding e a configuração de cobrança." }, 409);
    if (office.status === "cancelado") return json({ erro: "Escritório cancelado." }, 409);
    const cents = addonPriceCents(quantidade, office.valor_excedente_centavos);
    const invoice = await admin.from("faturas").insert({ escritorio_id: identity.escritorioId, tipo: "addon", status: "pendente", valor_centavos: cents, quantidade_pecas: quantidade, vencimento: new Date().toISOString().slice(0, 10), metadata: { environment: "sandbox" } }).select("id").single();
    if (invoice.error || !invoice.data) throw invoice.error ?? new Error("FATURA_NAO_CRIADA");
    try {
      const payment = await new AsaasClient().createPayment({ customer: office.asaas_customer_id, cents, dueDate: new Date().toISOString().slice(0, 10), description: `Pacote de ${quantidade} peça(s) extra(s)`, externalReference: `fatura:${invoice.data.id}` });
      const updated = await admin.from("faturas").update({ asaas_payment_id: payment.id, asaas_id: payment.id, metadata: { environment: "sandbox", invoice_url: payment.invoiceUrl ?? null } }).eq("id", invoice.data.id);
      if (updated.error) throw updated.error;
      return json({ ok: true, fatura_id: invoice.data.id, pagamento_url: payment.invoiceUrl ?? null }, 201);
    } catch (cause) {
      await admin.from("faturas").delete().eq("id", invoice.data.id).eq("status", "pendente");
      throw cause;
    }
  } catch {
    return json({ erro: "Não foi possível criar a cobrança no sandbox." }, 400);
  }
}

import "server-only";

import { z } from "zod/v4";

import { centsToAsaasValue } from "@/lib/billing/money";
import { getBillingEnvironment, type BillingEnvironment } from "@/lib/env/server";

const paymentSchema = z.object({
  id: z.string().min(1), customer: z.string().min(1), status: z.string().min(1),
  value: z.union([z.number(), z.string()]), externalReference: z.string().nullable().optional(),
  subscription: z.string().nullable().optional(), invoiceUrl: z.string().url().startsWith("https://").nullable().optional(),
  dueDate: z.string().optional(),
});
const subscriptionSchema = z.object({ id: z.string().min(1), customer: z.string().min(1), status: z.string().min(1), value: z.union([z.number(), z.string()]), externalReference: z.string().nullable().optional() });
const customerSchema = z.object({ id: z.string().min(1), externalReference: z.string().nullable().optional() });
const listSchema = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item), hasMore: z.boolean().optional() });

export type AsaasPayment = z.infer<typeof paymentSchema>;
export type AsaasSubscription = z.infer<typeof subscriptionSchema>;

export class AsaasClient {
  private readonly baseUrl = "https://api-sandbox.asaas.com/v3";
  constructor(private readonly env: BillingEnvironment = getBillingEnvironment(), private readonly fetcher: typeof fetch = fetch) {
    if (env.ASAAS_ENVIRONMENT !== "sandbox") throw new Error("ASAAS_PRODUCAO_BLOQUEADO");
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      ...init,
      headers: { accept: "application/json", "content-type": "application/json", "user-agent": "cortex-previdenciario", access_token: this.env.ASAAS_API_KEY, ...init.headers },
      signal: AbortSignal.timeout(15_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`ASAAS_HTTP_${response.status}`);
    return body;
  }

  async findCustomer(externalReference: string) {
    const result = listSchema(customerSchema).parse(await this.request(`/customers?externalReference=${encodeURIComponent(externalReference)}&limit=1`));
    return result.data[0] ?? null;
  }
  async createCustomer(input: { name: string; email: string; externalReference: string }) {
    return customerSchema.parse(await this.request("/customers", { method: "POST", body: JSON.stringify({ ...input, notificationDisabled: true }) }));
  }
  async createPayment(input: { customer: string; cents: number; dueDate: string; description: string; externalReference: string }) {
    return paymentSchema.parse(await this.request("/payments", { method: "POST", body: JSON.stringify({ customer: input.customer, billingType: "UNDEFINED", value: centsToAsaasValue(input.cents), dueDate: input.dueDate, description: input.description, externalReference: input.externalReference }) }));
  }
  async findPayment(externalReference: string) {
    const result = listSchema(paymentSchema).parse(await this.request(`/payments?externalReference=${encodeURIComponent(externalReference)}&limit=1`));
    return result.data[0] ?? null;
  }
  async createSubscription(input: { customer: string; cents: number; nextDueDate: string; externalReference: string }) {
    return subscriptionSchema.parse(await this.request("/subscriptions", { method: "POST", body: JSON.stringify({ customer: input.customer, billingType: "UNDEFINED", value: centsToAsaasValue(input.cents), nextDueDate: input.nextDueDate, cycle: "MONTHLY", description: "Assinatura Córtex mensal", externalReference: input.externalReference }) }));
  }
  async findSubscription(externalReference: string) {
    const result = listSchema(subscriptionSchema).parse(await this.request(`/subscriptions?externalReference=${encodeURIComponent(externalReference)}&limit=1`));
    return result.data[0] ?? null;
  }
  async getPayment(id: string) { return paymentSchema.parse(await this.request(`/payments/${encodeURIComponent(id)}`)); }
  async getSubscription(id: string) { return subscriptionSchema.parse(await this.request(`/subscriptions/${encodeURIComponent(id)}`)); }
  async listPaymentsSince(date: string) {
    const payments: AsaasPayment[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = listSchema(paymentSchema).parse(await this.request(`/payments?dateCreated%5Bge%5D=${encodeURIComponent(date)}&limit=100&offset=${offset}`));
      payments.push(...page.data);
      if (!page.hasMore) return payments;
    }
  }
  async listSubscriptions() {
    const subscriptions: AsaasSubscription[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = listSchema(subscriptionSchema).parse(await this.request(`/subscriptions?limit=100&offset=${offset}`));
      subscriptions.push(...page.data);
      if (!page.hasMore) return subscriptions;
    }
  }
}

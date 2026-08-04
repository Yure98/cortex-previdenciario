import { describe, expect, it, vi } from "vitest";

import { addonPriceCents, asaasValueToCents, centsToAsaasValue } from "@/lib/billing/money";
import { AsaasClient } from "@/lib/billing/asaas";
import { isValidWebhookToken, processAsaasEvent } from "@/lib/billing/webhook";
import { sendOfficeNotification } from "@/lib/notifications/email";
import { POST as webhookPost } from "@/app/api/webhooks/asaas/route";

describe("cobrança", () => {
  it("calcula somente em centavos sem perda de precisão", () => {
    expect(addonPriceCents(10)).toBe(29000);
    expect(centsToAsaasValue(39700)).toBe(397);
    expect(asaasValueToCents("397.00")).toBe(39700);
    expect(() => asaasValueToCents("29.999")).toThrow("VALOR_ASAAS_INVALIDO");
  });

  it("recusa inicializar o cliente fora do sandbox", () => {
    expect(() => new AsaasClient({ ASAAS_API_KEY: "key", ASAAS_WEBHOOK_TOKEN: "x".repeat(32), ASAAS_ENVIRONMENT: "production", APP_URL: "https://cortex.test" } as never)).toThrow("ASAAS_PRODUCAO_BLOQUEADO");
  });

  it("compara o token do webhook sem depender do comprimento", () => {
    const expected = "a".repeat(32);
    expect(isValidWebhookToken(expected, expected)).toBe(true);
    expect(isValidWebhookToken("curto", expected)).toBe(false);
    expect(isValidWebhookToken(null, expected)).toBe(false);
  });

  it("token inválido retorna 401 antes de qualquer efeito", async () => {
    vi.stubEnv("APP_URL", "https://cortex.test"); vi.stubEnv("ASAAS_API_KEY", "sandbox_key");
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "t".repeat(32)); vi.stubEnv("ASAAS_ENVIRONMENT", "sandbox");
    const response = await webhookPost(new Request("https://cortex.test/api/webhooks/asaas", { method: "POST", headers: { "asaas-access-token": "invalid" }, body: JSON.stringify({ id: "evt", event: "PAYMENT_CONFIRMED", payment: { id: "pay" } }) }));
    expect(response.status).toBe(401); vi.unstubAllEnvs();
  });

  it("encaminha evento duplicado uma vez ao RPC idempotente", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "duplicado", error: null });
    const getPayment = vi.fn().mockResolvedValue({ id: "pay_1", customer: "cus_1", status: "CONFIRMED", value: "29.00" });
    const webhookQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const result = await processAsaasEvent({
      event: { id: "evt_1", event: "PAYMENT_CONFIRMED", payment: { id: "pay_1" } },
      payloadHash: "a".repeat(64),
      admin: { rpc, from: vi.fn().mockReturnValue(webhookQuery) } as never,
      asaas: { getPayment } as never,
    });
    expect(result).toBe("duplicado");
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_event_id: "evt_1", p_valor_centavos: 2900 });
  });

  it("responde duplicado sem depender novamente da API do Asaas", async () => {
    const rpc = vi.fn(); const getPayment = vi.fn();
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "stored" }, error: null }) };
    const result = await processAsaasEvent({ event: { id: "evt_retry", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }, payloadHash: "b".repeat(64), admin: { from: vi.fn().mockReturnValue(query), rpc } as never, asaas: { getPayment } as never });
    expect(result).toBe("duplicado"); expect(getPayment).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });

  it("falha aberta quando o Resend está indisponível", async () => {
    vi.stubEnv("APP_URL", "https://cortex.test");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "Cortex <noreply@cortex.test>");
    const insert = vi.fn().mockResolvedValue({ error: null });
    const usersQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "71000000-0000-0000-0000-000000000001" }, error: null }) };
    const admin = {
      from: vi.fn((table: string) => table === "usuarios" ? usersQuery : { insert }),
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: "owner@cortex.test" } }, error: null }) } },
    };
    const sent = await sendOfficeNotification({ kind: "peca_pronta", escritorioId: "70000000-0000-0000-0000-000000000000", admin: admin as never, fetcher: vi.fn().mockRejectedValue(new Error("offline")) });
    expect(sent).toBe(false);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ evento: "email.peca_pronta.falhou" }));
    vi.unstubAllEnvs();
  });
});

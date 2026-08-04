import { createHmac } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { sendOperationalAlert } from "@/lib/observability/alerts";
import { logInfo } from "@/lib/observability/logger";
import { consumeRateLimit, getClientIp, hashRateLimitKey } from "@/lib/security/rate-limit";

describe("Fase 7 — observabilidade e rate limiting", () => {
  it("gera chave HMAC estável sem reter o identificador", () => {
    const secret = "s".repeat(32);
    const hash = hashRateLimitKey("auth:email", "Pessoa@Exemplo.com", secret);
    const expected = createHmac("sha256", secret)
      .update("auth:email")
      .update("\0")
      .update("pessoa@exemplo.com")
      .digest("hex");
    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("pessoa");
  });

  it("prioriza o IP confiável fornecido pela Vercel", () => {
    const requestHeaders = new Headers({
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-forwarded-for": "198.51.100.7",
    });
    expect(getClientIp(requestHeaders)).toBe("203.0.113.10");
  });

  it("envia somente hash ao RPC de rate limit", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ permitido: true, restantes: 4, tentar_novamente_em: 0 }],
      error: null,
    });
    const result = await consumeRateLimit({
      admin: { rpc } as never,
      scope: "auth:email",
      identifier: "segredo@exemplo.com",
      limit: 5,
      windowSeconds: 900,
      secret: "k".repeat(32),
    });
    expect(result).toEqual({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
    expect(rpc).toHaveBeenCalledWith("consumir_rate_limit", expect.objectContaining({
      p_escopo: "auth:email",
      p_limite: 5,
      p_janela_segundos: 900,
      p_chave_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    }));
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("segredo@exemplo.com");
  });

  it("emite log JSON somente com contexto permitido", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logInfo({ event: "generation_completed", caso_id: "caso", escritorio_id: "office", duration_ms: 12 });
    const record = JSON.parse(String(spy.mock.calls[0]?.[0]));
    expect(record).toMatchObject({ level: "info", event: "generation_completed", caso_id: "caso", escritorio_id: "office", duration_ms: 12 });
    expect(record).not.toHaveProperty("body");
    expect(record).not.toHaveProperty("email");
    spy.mockRestore();
  });

  it("envia alerta ao endereço configurado pelo Resend sem conteúdo de caso", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "noreply@cortex.test");
    vi.stubEnv("OPS_ALERT_EMAIL", "operacoes@cortex.test");
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));

    await sendOperationalAlert(
      { event: "alert_generation_error_rate", caso_id: "caso-1", code: "INTERNAL" },
      fetcher,
    );

    const request = fetcher.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body));
    expect(fetcher).toHaveBeenCalledWith("https://api.resend.com/emails", expect.any(Object));
    expect(body).toMatchObject({
      to: ["operacoes@cortex.test"],
      subject: "[Córtex] Alerta operacional: alert_generation_error_rate",
    });
    expect(body.text).toContain("caso-1");
    expect(body.text).not.toContain("CNIS");
    vi.unstubAllEnvs();
  });
});

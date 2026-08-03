import { afterEach, describe, expect, it } from "vitest";

import {
  hasPdfSignature,
  hasSameOrigin,
  hasZipSignature,
  newCaseSchema,
  onboardingSchema,
} from "@/lib/portal/validation";

describe("validação do portal", () => {
  const originalAppUrl = process.env.APP_URL;
  afterEach(() => {
    if (originalAppUrl) process.env.APP_URL = originalAppUrl;
    else delete process.env.APP_URL;
  });

  it("aceita somente origem local ou APP_URL configurada", () => {
    process.env.APP_URL = "https://app.cortex.test";
    expect(hasSameOrigin(new Request("https://preview.cortex.test/api/casos", { headers: { origin: "https://app.cortex.test" } }))).toBe(true);
    expect(hasSameOrigin(new Request("https://preview.cortex.test/api/casos", { headers: { origin: "https://preview.cortex.test" } }))).toBe(true);
    expect(hasSameOrigin(new Request("https://preview.cortex.test/api/casos", { headers: { origin: "https://malicioso.test" } }))).toBe(false);
    expect(hasSameOrigin(new Request("https://preview.cortex.test/api/casos"))).toBe(false);
  });

  it("confere assinaturas binárias antes do processamento", () => {
    expect(hasPdfSignature(Buffer.from("%PDF-1.7"))).toBe(true);
    expect(hasPdfSignature(Buffer.from("arquivo falso"))).toBe(false);
    expect(hasZipSignature(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(hasZipSignature(Buffer.from("nao e zip"))).toBe(false);
  });

  it("rejeita URL insegura e cores fora do contrato", () => {
    const result = onboardingSchema.safeParse({
      nome: "Escritório Teste", nomeUsuario: "Pessoa Teste", oab: "OAB/AL 1",
      cidade: "Maceió", notebooklmUrl: "http://inseguro.test", corPrimaria: "black",
      corSecundaria: "#f5f5f5", corAcento: "#3b82f6",
    });
    expect(result.success).toBe(false);
  });

  it("limita fatos e exige as duas decisões do caso", () => {
    expect(newCaseSchema.safeParse({
      clienteFinal: "Cliente", beneficio: "Aposentadoria", tipoPeca: "peticao",
      fatos: "Fatos suficientes para avaliação.", pedidos: "Conceder benefício",
      pesquisouJuris: "sim", formato: "visual_law",
    }).success).toBe(true);
    expect(newCaseSchema.safeParse({
      clienteFinal: "Cliente", beneficio: "Aposentadoria", tipoPeca: "peticao",
      fatos: "curto", pedidos: "Conceder benefício", formato: "tradicional",
    }).success).toBe(false);
  });
});


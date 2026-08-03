import { describe, expect, it } from "vitest";

import { createDeidentifiedRagQuery } from "@/lib/rag/deidentified-query";

describe("createDeidentifiedRagQuery", () => {
  it("produz somente benefício e vocabulário jurídico controlado", () => {
    expect(
      createDeidentifiedRagQuery({
        beneficio: "incapacidade",
        palavrasChave: ["pericia", "incapacidade temporaria"],
      }),
    ).toBe("beneficio: incapacidade; palavras-chave: incapacidade temporaria, pericia");
  });

  it.each([
    "123.456.789-00",
    "Maria da Silva",
    "meu-cliente@email.com",
    "11999999999",
    "CNIS completo",
  ])("recusa texto livre ou identificável: %s", (sensitiveValue) => {
    expect(() =>
      createDeidentifiedRagQuery({
        beneficio: "incapacidade",
        palavrasChave: [sensitiveValue],
      } as never),
    ).toThrow();
  });

  it("limita a consulta a oito palavras-chave", () => {
    expect(() =>
      createDeidentifiedRagQuery({
        beneficio: "aposentadoria",
        palavrasChave: [
          "pcd",
          "deficiencia",
          "avaliacao biopsicossocial",
          "tempo especial",
          "agentes nocivos",
          "ruido",
          "carencia",
          "qualidade de segurado",
          "pericia",
        ],
      }),
    ).toThrow();
  });
});

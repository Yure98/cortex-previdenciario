import { describe, expect, it, vi } from "vitest";

import { TrackedAnthropicClient } from "@/lib/engine/anthropic";
import { EngineError } from "@/lib/engine/errors";
import { classificationSchema } from "@/lib/engine/schemas";
import type { UsageLedger } from "@/lib/engine/usage-ledger";

describe("teto antes da chamada", () => {
  it("aborta antes do provedor quando a reserva é recusada", async () => {
    const finish = vi.fn();
    const ledger: UsageLedger = {
      reserve: vi.fn().mockRejectedValue(new EngineError("TETO_ATINGIDO", "teto")),
      finish,
    };
    const client = new TrackedAnthropicClient(
      {
        apiKey: "não-será-usada",
        haiku: {
          id: "claude-haiku-test",
          pricing: { inputUsdPerMillion: 1, outputUsdPerMillion: 5 },
        },
        sonnet: {
          id: "claude-sonnet-test",
          pricing: { inputUsdPerMillion: 2, outputUsdPerMillion: 10 },
        },
      },
      ledger,
    );

    await expect(
      client.call({
        role: "haiku",
        stage: "classificacao",
        staticPrompt: "estático",
        dynamicPrompt: "dinâmico",
        schema: classificationSchema,
        maxOutputTokens: 100,
      }),
    ).rejects.toMatchObject({ code: "TETO_ATINGIDO" });
    expect(finish).not.toHaveBeenCalled();
  });
});

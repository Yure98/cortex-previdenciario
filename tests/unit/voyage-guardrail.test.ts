import { afterEach, describe, expect, it, vi } from "vitest";

import type { UsageLedger } from "@/lib/engine/usage-ledger";
import { DeidentifiedVoyageClient } from "@/lib/engine/voyage";

describe("guardrail Voyage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("envia somente o resumo controlado e força 1.024 dimensões", async () => {
    const completions: unknown[] = [];
    const ledger: UsageLedger = {
      reserve: vi.fn().mockResolvedValue("usage-id"),
      finish: vi.fn(async (_id, usage) => {
        completions.push(usage);
      }),
    };
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.input).toBe(
        "beneficio: incapacidade; palavras-chave: incapacidade temporaria, pericia",
      );
      expect(body.output_dimension).toBe(1024);
      expect(JSON.stringify(body)).not.toMatch(/CPF|CNIS|Maria|123\.456/i);
      return new Response(
        JSON.stringify({
          data: [{ embedding: Array.from({ length: 1024 }, () => 0), index: 0 }],
          model: "voyage-4",
          usage: { total_tokens: 18 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new DeidentifiedVoyageClient(
      { apiKey: "test", model: "voyage-4", inputUsdPerMillion: 0.06 },
      ledger,
    );
    const embedding = await client.embedCaseQuery({
      beneficio: "incapacidade",
      palavrasChave: ["pericia", "incapacidade temporaria"],
    });

    expect(embedding).toHaveLength(1024);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(completions).toHaveLength(1);
  });
});

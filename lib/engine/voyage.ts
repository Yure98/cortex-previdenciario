import "server-only";

import { z } from "zod/v4";

import { EngineError } from "@/lib/engine/errors";
import {
  calculateEmbeddingCostUsd,
  estimateTokenUpperBound,
} from "@/lib/engine/pricing";
import type { UsageLedger } from "@/lib/engine/usage-ledger";
import {
  createDeidentifiedRagQuery,
  type DeidentifiedRagInput,
} from "@/lib/rag/deidentified-query";

const voyageResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()).length(1024),
      index: z.number().int(),
    }),
  ).length(1),
  model: z.string(),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }),
});

interface VoyageConfiguration {
  apiKey: string;
  model: "voyage-4";
  inputUsdPerMillion: number;
}

export class DeidentifiedVoyageClient {
  constructor(
    private readonly configuration: VoyageConfiguration,
    private readonly ledger: UsageLedger,
  ) {}

  async embedCaseQuery(input: DeidentifiedRagInput): Promise<number[]> {
    // Esta é a única transformação autorizada antes de sair do ambiente do produto.
    const query = createDeidentifiedRagQuery(input);
    const reservedTokens = estimateTokenUpperBound(query);
    const usageId = await this.ledger.reserve({
      provider: "voyage",
      stage: "rag_embedding_consulta_deidentificada",
      model: this.configuration.model,
      reservedTokens,
      reservedCostUsd: calculateEmbeddingCostUsd(
        reservedTokens,
        this.configuration.inputUsdPerMillion,
      ),
    });

    let finalized = false;

    try {
      const response = await fetch("https://api.voyageai.com/v1/embeddings", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.configuration.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: query,
          model: this.configuration.model,
          input_type: "query",
          output_dimension: 1024,
          output_dtype: "float",
          truncation: false,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        throw new Error(`VOYAGE_HTTP_${response.status}`);
      }

      const parsed = voyageResponseSchema.parse(await response.json());
      const tokens = parsed.usage.total_tokens;
      await this.ledger.finish(usageId, {
        status: "concluida",
        inputTokens: tokens,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        costUsd: calculateEmbeddingCostUsd(tokens, this.configuration.inputUsdPerMillion),
      });
      finalized = true;

      return parsed.data[0].embedding;
    } catch (error) {
      if (!finalized) {
        await this.ledger.finish(usageId, {
          status: "falhou",
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUsd: 0,
          errorCode: error instanceof Error ? error.message.slice(0, 80) : "VOYAGE_UNKNOWN",
        });
      }
      throw new EngineError("PROVEDOR_INDISPONIVEL", "A chamada de embedding falhou.", {
        retryable: true,
        cause: error,
      });
    }
  }
}

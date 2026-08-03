import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";

import { EngineError } from "@/lib/engine/errors";
import {
  calculateAnthropicCostUsd,
  estimateAnthropicReservationUsd,
  estimateTokenUpperBound,
  type AnthropicPricing,
  type AnthropicUsage,
} from "@/lib/engine/pricing";
import type { UsageLedger } from "@/lib/engine/usage-ledger";

export type ModelRole = "haiku" | "sonnet";

interface ModelConfiguration {
  id: string;
  pricing: AnthropicPricing;
}

export interface AnthropicEngineConfiguration {
  apiKey: string;
  haiku: ModelConfiguration;
  sonnet: ModelConfiguration;
}

export interface StructuredCallInput<TSchema extends z.ZodType> {
  role: ModelRole;
  stage: string;
  staticPrompt: string;
  dynamicPrompt: string;
  schema: TSchema;
  maxOutputTokens: number;
}

export function buildCachedPromptBlocks(staticPrompt: string, dynamicPrompt: string) {
  return {
    system: [
      {
        type: "text" as const,
        text: staticPrompt,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [
      {
        role: "user" as const,
        content: [{ type: "text" as const, text: dynamicPrompt }],
      },
    ],
  };
}

function providerErrorCode(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    return `ANTHROPIC_${error.status ?? "API"}`;
  }
  return "ANTHROPIC_UNKNOWN";
}

export class TrackedAnthropicClient {
  private readonly client: Anthropic;

  constructor(
    private readonly configuration: AnthropicEngineConfiguration,
    private readonly ledger: UsageLedger,
  ) {
    this.client = new Anthropic({ apiKey: configuration.apiKey, maxRetries: 2, timeout: 180_000 });
  }

  async call<TSchema extends z.ZodType>(
    input: StructuredCallInput<TSchema>,
  ): Promise<z.infer<TSchema>> {
    const model = this.configuration[input.role];
    const estimatedInputTokens = estimateTokenUpperBound(input.staticPrompt, input.dynamicPrompt);
    const reservedCostUsd = estimateAnthropicReservationUsd(
      estimatedInputTokens,
      input.maxOutputTokens,
      model.pricing,
    );
    const usageId = await this.ledger.reserve({
      provider: "anthropic",
      stage: input.stage,
      model: model.id,
      reservedCostUsd,
      reservedTokens: estimatedInputTokens + input.maxOutputTokens,
    });

    let finalized = false;

    try {
      const promptBlocks = buildCachedPromptBlocks(input.staticPrompt, input.dynamicPrompt);
      const message = await this.client.messages.create({
        model: model.id,
        max_tokens: input.maxOutputTokens,
        system: promptBlocks.system,
        messages: promptBlocks.messages,
        output_config: {
          format: zodOutputFormat(input.schema),
        },
      });

      const usage: AnthropicUsage = {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      };
      const costUsd = calculateAnthropicCostUsd(usage, model.pricing);

      await this.ledger.finish(usageId, {
        status: "concluida",
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        costUsd,
      });
      finalized = true;

      const text = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("\n");

      try {
        return input.schema.parse(JSON.parse(text));
      } catch (error) {
        throw new EngineError(
          "RESPOSTA_MODELO_INVALIDA",
          "O modelo não devolveu a estrutura esperada.",
          { cause: error },
        );
      }
    } catch (error) {
      if (!finalized) {
        await this.ledger.finish(usageId, {
          status: "falhou",
          inputTokens: 0,
          outputTokens: 0,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          costUsd: 0,
          errorCode: providerErrorCode(error),
        });
      }

      if (error instanceof EngineError) {
        throw error;
      }
      throw new EngineError("PROVEDOR_INDISPONIVEL", "A chamada à Anthropic falhou.", {
        retryable: true,
        cause: error,
      });
    }
  }
}

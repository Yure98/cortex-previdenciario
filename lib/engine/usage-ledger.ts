import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EngineError } from "@/lib/engine/errors";

export type UsageProvider = "anthropic" | "voyage";
export type FinalUsageStatus = "concluida" | "falhou";

export interface UsageReservation {
  provider: UsageProvider;
  stage: string;
  model: string;
  reservedCostUsd: number;
  reservedTokens: number;
}

export interface UsageCompletion {
  status: FinalUsageStatus;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUsd: number;
  errorCode?: string;
}

export interface UsageLedger {
  reserve(input: UsageReservation): Promise<string>;
  finish(usageId: string, input: UsageCompletion): Promise<void>;
}

interface SupabaseUsageLedgerOptions {
  admin: SupabaseClient;
  escritorioId: string;
  casoId: string;
  requestId: string;
  globalLimitUsd: number;
  pieceLimitUsd: number;
  usdBrlRate: number;
}

export class SupabaseUsageLedger implements UsageLedger {
  constructor(private readonly options: SupabaseUsageLedgerOptions) {}

  async reserve(input: UsageReservation): Promise<string> {
    const { data, error } = await this.options.admin.rpc("reservar_uso_tokens", {
      p_escritorio_id: this.options.escritorioId,
      p_caso_id: this.options.casoId,
      p_request_id: this.options.requestId,
      p_provedor: input.provider,
      p_etapa: input.stage,
      p_modelo: input.model,
      p_custo_reservado_usd: input.reservedCostUsd,
      p_tokens_reservados: input.reservedTokens,
      p_limite_global_usd: this.options.globalLimitUsd,
      p_limite_peca_usd: this.options.pieceLimitUsd,
    });

    if (error || typeof data !== "string") {
      const message = error?.message ?? "RESERVA_INVALIDA";
      if (message.includes("TETO_ATINGIDO")) {
        throw new EngineError("TETO_ATINGIDO", "O teto de gasto foi atingido.", {
          cause: error,
        });
      }
      throw new EngineError("ERRO_INTERNO", "Não foi possível reservar o custo da chamada.", {
        cause: error,
      });
    }

    return data;
  }

  async finish(usageId: string, input: UsageCompletion): Promise<void> {
    const { error } = await this.options.admin.rpc("finalizar_uso_tokens", {
      p_uso_id: usageId,
      p_status: input.status,
      p_input_tokens: input.inputTokens,
      p_output_tokens: input.outputTokens,
      p_cache_read_input_tokens: input.cacheReadInputTokens,
      p_cache_creation_input_tokens: input.cacheCreationInputTokens,
      p_custo_usd: input.costUsd,
      p_cotacao_usd_brl: this.options.usdBrlRate,
      p_erro_codigo: input.errorCode ?? null,
    });

    if (error) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível finalizar o registro de uso.", {
        cause: error,
      });
    }
  }
}

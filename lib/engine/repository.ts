import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";

import { EngineError, normalizeEngineError } from "@/lib/engine/errors";
import type { GenerationCase } from "@/lib/engine/schemas";
import type { ProgressStage } from "@/lib/engine/pipeline";

const generationCaseSchema = z.object({
  id: z.string().uuid(),
  escritorio_id: z.string().uuid(),
  cliente_final: z.string(),
  beneficio: z.string(),
  tipo_peca: z.string(),
  formato: z.enum(["tradicional", "visual_law"]),
  pesquisou_juris: z.boolean(),
  fatos: z.string().nullable(),
  pedidos: z.array(z.unknown()),
  inputs: z.record(z.string(), z.unknown()),
});

const existingGenerationSchema = z.object({
  id: z.string().uuid(),
  caso_id: z.string().uuid(),
  request_id: z.string().uuid(),
  status: z.enum(["iniciada", "processando", "concluida", "falhou"]),
  etapa_atual: z.string(),
  teses_aplicadas: z.array(z.unknown()),
  revisao: z.unknown().nullable(),
  custo_usd: z.coerce.number(),
  custo_brl: z.coerce.number(),
  erro_codigo: z.string().nullable(),
});

export type ExistingGeneration = z.infer<typeof existingGenerationSchema>;

interface CreateGenerationInput {
  escritorioId: string;
  casoId: string;
  requestId: string;
  tipoOperacao: "peticao" | "cnis";
}

interface CompleteCosts {
  usd: number;
  brl: number;
}

export class EngineRepository {
  constructor(private readonly admin: SupabaseClient) {}

  async findByRequestId(requestId: string, escritorioId: string): Promise<ExistingGeneration | null> {
    const { data, error } = await this.admin
      .from("geracoes")
      .select(
        "id,caso_id,request_id,status,etapa_atual,teses_aplicadas,revisao,custo_usd,custo_brl,erro_codigo",
      )
      .eq("request_id", requestId)
      .eq("escritorio_id", escritorioId)
      .maybeSingle();

    if (error) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível consultar a geração.", {
        cause: error,
      });
    }
    return data ? existingGenerationSchema.parse(data) : null;
  }

  async loadCase(casoId: string, escritorioId: string): Promise<GenerationCase> {
    const { data, error } = await this.admin
      .from("casos")
      .select(
        "id,escritorio_id,cliente_final,beneficio,tipo_peca,formato,pesquisou_juris,fatos,pedidos,inputs",
      )
      .eq("id", casoId)
      .eq("escritorio_id", escritorioId)
      .maybeSingle();

    if (error) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível carregar o caso.", { cause: error });
    }
    if (!data) {
      throw new EngineError("CASO_NAO_ENCONTRADO", "Caso não encontrado.");
    }
    return generationCaseSchema.parse(data);
  }

  async precheckSpendCap(
    escritorioId: string,
    casoId: string,
    globalLimitUsd: number,
    pieceLimitUsd: number,
  ): Promise<void> {
    const { error } = await this.admin.rpc("checar_teto_geracao", {
      p_escritorio_id: escritorioId,
      p_caso_id: casoId,
      p_limite_global_usd: globalLimitUsd,
      p_limite_peca_usd: pieceLimitUsd,
    });
    if (error) {
      throw normalizeEngineError(error);
    }
  }

  async createGeneration(input: CreateGenerationInput): Promise<string> {
    const { data, error } = await this.admin
      .from("geracoes")
      .insert({
        escritorio_id: input.escritorioId,
        caso_id: input.casoId,
        request_id: input.requestId,
        tipo_operacao: input.tipoOperacao,
        status: "iniciada",
        etapa_atual: "precheck",
      })
      .select("id")
      .single();

    if (error || !data) {
      throw normalizeEngineError(error ?? new Error("GERACAO_NAO_CRIADA"));
    }
    return z.object({ id: z.string().uuid() }).parse(data).id;
  }

  async authorizeCommercial(
    escritorioId: string,
    casoId: string,
    geracaoId: string,
  ): Promise<"franquia" | "excedente"> {
    const { data, error } = await this.admin.rpc("autorizar_geracao_caso", {
      p_escritorio_id: escritorioId,
      p_caso_id: casoId,
      p_geracao_id: geracaoId,
    });
    if (error) {
      throw normalizeEngineError(error);
    }
    return z.enum(["franquia", "excedente"]).parse(data);
  }

  async createSignedCnisUrl(casoId: string, escritorioId: string): Promise<string> {
    const { data: document, error } = await this.admin
      .from("documentos")
      .select("arquivo_path,mime_type")
      .eq("caso_id", casoId)
      .eq("escritorio_id", escritorioId)
      .eq("tipo", "cnis")
      .order("versao", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível consultar o CNIS.", { cause: error });
    }
    if (!document) {
      throw new EngineError("CNIS_NAO_ENCONTRADO", "O caso não possui CNIS.");
    }
    const parsed = z
      .object({ arquivo_path: z.string().min(1), mime_type: z.string().nullable() })
      .parse(document);
    if (parsed.mime_type && parsed.mime_type !== "application/pdf") {
      throw new EngineError("CNIS_INVALIDO", "O documento CNIS precisa ser PDF.");
    }

    const { data, error: signedError } = await this.admin.storage
      .from("cnis")
      .createSignedUrl(parsed.arquivo_path, 90);

    if (signedError || !data?.signedUrl) {
      throw new EngineError("CNIS_NAO_ENCONTRADO", "Não foi possível abrir o CNIS privado.", {
        cause: signedError,
      });
    }
    return data.signedUrl;
  }

  async saveProgress(geracaoId: string, stage: ProgressStage, data: unknown): Promise<void> {
    const update: Record<string, unknown> = {
      status: "processando",
      etapa_atual: stage,
    };

    if (stage === "diagnostico") update.diagnostico = data;
    if (stage === "classificacao") update.classificacao = data;
    if (stage === "rag") update.teses_aplicadas = data;
    if (stage === "analise") update.analise = data;
    if (stage === "redacao" || stage === "correcao") update.minuta = data;
    if (stage === "revisao") update.revisao = data;

    const { error } = await this.admin.from("geracoes").update(update).eq("id", geracaoId);
    if (error) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível persistir o progresso.", {
        cause: error,
      });
    }
  }

  async calculateCosts(requestId: string, usdBrlRate: number): Promise<CompleteCosts> {
    const { data, error } = await this.admin
      .from("uso_tokens")
      .select("custo_usd")
      .eq("request_id", requestId)
      .eq("status", "concluida");

    if (error) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível calcular o custo da peça.", {
        cause: error,
      });
    }
    const usd = (data ?? []).reduce(
      (total, row) => total + Number((row as { custo_usd: string | number }).custo_usd),
      0,
    );
    return { usd, brl: usd * usdBrlRate };
  }

  async complete(geracaoId: string, costs: CompleteCosts): Promise<void> {
    const { error } = await this.admin.rpc("concluir_geracao_motor", {
      p_geracao_id: geracaoId,
      p_custo_usd: costs.usd,
      p_custo_brl: costs.brl,
    });
    if (error) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível concluir a geração.", {
        cause: error,
      });
    }
  }

  async fail(geracaoId: string, code: string, detail: string): Promise<void> {
    const { error } = await this.admin.rpc("falhar_geracao_motor", {
      p_geracao_id: geracaoId,
      p_erro_codigo: code,
      p_erro_detalhe: detail,
    });
    if (error) {
      // O erro original tem prioridade; a reserva de custo permanece conservadora no banco.
      return;
    }
  }
}

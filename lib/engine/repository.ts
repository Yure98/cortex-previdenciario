import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod/v4";

import { EngineError, normalizeEngineError } from "@/lib/engine/errors";
import type { GenerationCase } from "@/lib/engine/schemas";
import type { ProgressStage } from "@/lib/engine/pipeline";
import type { GeneratedDocx, OfficeDocumentConfig } from "@/lib/docx/types";

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

const officeDocumentSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  oab: z.string().nullable(),
  cidade: z.string().nullable(),
  timbrado_path: z.string().nullable(),
  cor_primaria: z.string(),
  cor_secundaria: z.string(),
  cor_acento: z.string(),
});

const deliverySchema = z.object({
  id: z.string().uuid(),
  arquivo_path: z.string().min(1),
  nome_arquivo: z.string().min(1),
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

  async loadOfficeDocumentConfig(escritorioId: string): Promise<OfficeDocumentConfig> {
    const { data, error } = await this.admin
      .from("escritorios")
      .select("id,nome,oab,cidade,timbrado_path,cor_primaria,cor_secundaria,cor_acento")
      .eq("id", escritorioId)
      .maybeSingle();
    if (error || !data) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível carregar o timbrado do escritório.", {
        cause: error,
      });
    }
    const parsed = officeDocumentSchema.parse(data);
    return {
      id: parsed.id,
      nome: parsed.nome,
      oab: parsed.oab,
      cidade: parsed.cidade,
      timbradoPath: parsed.timbrado_path,
      corPrimaria: parsed.cor_primaria,
      corSecundaria: parsed.cor_secundaria,
      corAcento: parsed.cor_acento,
    };
  }

  async downloadOfficeTemplate(config: OfficeDocumentConfig): Promise<Buffer | null> {
    if (!config.timbradoPath) return null;
    if (!config.timbradoPath.startsWith(`${config.id}/`)) {
      throw new EngineError("TIMBRADO_INVALIDO", "O caminho do timbrado é inválido.");
    }
    const { data, error } = await this.admin.storage.from("timbrados").download(config.timbradoPath);
    if (error || !data) {
      throw new EngineError("TIMBRADO_INVALIDO", "Não foi possível abrir o timbrado privado.", {
        cause: error,
      });
    }
    return Buffer.from(await data.arrayBuffer());
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

  async publishDelivery(
    geracaoId: string,
    delivery: GeneratedDocx,
    costs: CompleteCosts,
  ): Promise<string> {
    const { error: uploadError } = await this.admin.storage
      .from("entregas")
      .upload(delivery.storagePath, delivery.buffer, {
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        cacheControl: "private, max-age=0, no-store",
        upsert: true,
      });
    if (uploadError) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível salvar a entrega privada.", {
        cause: uploadError,
      });
    }

    const { data, error } = await this.admin.rpc("registrar_entrega_concluir_geracao", {
      p_geracao_id: geracaoId,
      p_arquivo_path: delivery.storagePath,
      p_nome_arquivo: delivery.fileName,
      p_tamanho_bytes: delivery.buffer.byteLength,
      p_sha256: delivery.sha256,
      p_preflight: delivery.preflight ?? {},
      p_custo_usd: costs.usd,
      p_custo_brl: costs.brl,
    });
    if (error || !data) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível registrar a entrega.", {
        cause: error,
      });
    }
    return z.string().uuid().parse(data);
  }

  async getDeliveryByGeneration(geracaoId: string, escritorioId: string) {
    const { data, error } = await this.admin
      .from("entregas")
      .select("id,arquivo_path,nome_arquivo")
      .eq("geracao_id", geracaoId)
      .eq("escritorio_id", escritorioId)
      .maybeSingle();
    if (error) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível consultar a entrega.", {
        cause: error,
      });
    }
    if (!data) {
      throw new EngineError("ENTREGA_NAO_ENCONTRADA", "A entrega ainda não está disponível.");
    }
    return deliverySchema.parse(data);
  }

  async createSignedDeliveryUrl(
    arquivoPath: string,
    expiresInSeconds: number,
  ): Promise<{ signedUrl: string; expiresAt: string }> {
    const { data, error } = await this.admin.storage
      .from("entregas")
      .createSignedUrl(arquivoPath, expiresInSeconds, { download: true });
    if (error || !data?.signedUrl) {
      throw new EngineError("ENTREGA_NAO_ENCONTRADA", "Não foi possível assinar o download.", {
        cause: error,
      });
    }
    return {
      signedUrl: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1_000).toISOString(),
    };
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

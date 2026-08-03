import { z } from "zod/v4";

import { allowedBenefits, allowedRagKeywords } from "@/lib/rag/deidentified-query";

export const generationRequestSchema = z.object({
  caso_id: z.string().uuid(),
  escritorio_id: z.string().uuid().optional(),
  tipo_operacao: z.enum(["peticao", "cnis"]).default("peticao"),
});

export type GenerationRequest = z.infer<typeof generationRequestSchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const competenceSchema = z.string().regex(/^\d{4}-\d{2}$/);

export const cnisDiagnosticSchema = z.object({
  versao: z.literal("cnis-estrutural-v1"),
  qualidade_extracao: z.enum(["alta", "media", "baixa"]),
  paginas: z.number().int().nonnegative(),
  dados_pessoais: z.object({
    nascimento: isoDateSchema.nullable(),
    sexo: z.enum(["M", "F"]).nullable(),
  }),
  vinculos: z.array(
    z.object({
      empregador: z.string().nullable(),
      inicio: isoDateSchema,
      fim: isoDateSchema.nullable(),
      dias_no_intervalo: z.number().int().positive().nullable(),
      indicadores: z.array(z.string()),
    }),
  ),
  remuneracoes: z.array(
    z.object({
      competencia: competenceSchema,
      valor_centavos: z.number().int().nonnegative(),
      indicadores: z.array(z.string()),
    }),
  ),
  indicadores: z.array(z.string()),
  calculos: z.object({
    dias_contribuicao_sem_sobreposicao: z.number().int().nonnegative(),
    dias_contribuicao_ate_ec_103: z.number().int().nonnegative(),
    competencias_carencia: z.number().int().nonnegative(),
    periodos_concomitantes: z.number().int().nonnegative(),
    lacunas_superiores_30_dias: z.array(
      z.object({
        inicio: isoDateSchema,
        fim: isoDateSchema,
        dias: z.number().int().positive(),
      }),
    ),
  }),
  alertas: z.array(z.string()),
  confirmacoes_necessarias: z.array(z.string()),
});

export type CnisDiagnostic = z.infer<typeof cnisDiagnosticSchema>;

export const classificationSchema = z.object({
  beneficio_rag: z.enum(allowedBenefits),
  palavras_chave_rag: z.array(z.enum(allowedRagKeywords)).min(1).max(8),
  tipo_beneficio: z.string().min(2).max(120),
  tipo_peca_recomendado: z.string().min(2).max(120),
  prioridade: z.enum(["baixa", "media", "alta"]),
  pontos_atencao: z.array(z.string().max(500)).max(12),
  dados_faltantes: z.array(z.string().max(500)).max(20),
});

export type Classification = z.infer<typeof classificationSchema>;

export const legalAnalysisSchema = z.object({
  resumo_caso: z.string(),
  viabilidade: z.enum(["alta", "media", "baixa", "indeterminada"]),
  estrutura_argumentativa: z.array(
    z.object({
      titulo: z.string(),
      tese: z.string(),
      bases_legais: z.array(z.string()),
      provas: z.array(z.string()),
      riscos: z.array(z.string()),
    }),
  ),
  teses_aplicadas: z.array(z.string()).max(3),
  calculos_relevantes: z.array(
    z.object({
      item: z.string(),
      valor: z.string(),
      memoria: z.string(),
      ressalva: z.string().nullable(),
    }),
  ),
  pedidos_sugeridos: z.array(z.string()),
  alertas_estrategicos: z.array(z.string()),
  campos_pendentes: z.array(z.string()),
});

export type LegalAnalysis = z.infer<typeof legalAnalysisSchema>;

export const draftSchema = z.object({
  tipo_documento: z.enum(["peticao", "relatorio_cnis"]),
  conteudo_documento: z.string().min(200),
  campos_preencher: z.array(z.string()),
  observacoes: z.array(z.string()),
});

export type Draft = z.infer<typeof draftSchema>;

const correctionSchema = z.object({
  item: z.string(),
  descricao: z.string(),
  instrucao_redator: z.string(),
});

export const reviewSchema = z.object({
  status: z.enum(["APROVADO", "APROVADO_COM_RESSALVAS", "REPROVADO", "BLOQUEADO"]),
  ciclo: z.number().int().min(1).max(2),
  checklist: z.object({
    completude: z.enum(["OK", "FALHA", "ATENCAO"]),
    fundamentacao: z.enum(["OK", "FALHA", "ATENCAO"]),
    linguagem: z.enum(["OK", "FALHA", "ATENCAO"]),
    coerencia: z.enum(["OK", "FALHA", "ATENCAO"]),
  }),
  correcoes_obrigatorias: z.array(correctionSchema),
  correcoes_sugeridas: z.array(correctionSchema),
  campos_preencher: z.array(z.string()),
  observacoes: z.string(),
});

export type Review = z.infer<typeof reviewSchema>;

export const thesisSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  titulo: z.string(),
  beneficio: z.string().nullable(),
  resumo: z.string().nullable(),
  requisitos: z.array(z.unknown()),
  base_legal: z.array(z.unknown()),
  jurisprudencia_chave: z.array(z.unknown()),
  provas_necessarias: z.array(z.unknown()),
  modelo_redacao: z.string().nullable(),
  erros_comuns: z.array(z.unknown()),
  similaridade: z.number(),
});

export type RetrievedThesis = z.infer<typeof thesisSchema>;

export interface GenerationCase {
  id: string;
  escritorio_id: string;
  cliente_final: string;
  beneficio: string;
  tipo_peca: string;
  formato: "tradicional" | "visual_law";
  pesquisou_juris: boolean;
  fatos: string | null;
  pedidos: unknown[];
  inputs: Record<string, unknown>;
}

export interface PipelineResult {
  diagnostico: CnisDiagnostic;
  classificacao: Classification;
  teses: RetrievedThesis[];
  analise: LegalAnalysis;
  minuta: Draft;
  revisao: Review;
}

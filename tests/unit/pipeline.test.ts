import { describe, expect, it, vi } from "vitest";

import type { TrackedAnthropicClient } from "@/lib/engine/anthropic";
import type { CnisDiagnosticClient } from "@/lib/engine/diagnostico-client";
import { runGenerationPipeline } from "@/lib/engine/pipeline";
import type { ThesisRagService } from "@/lib/engine/rag";

const longDocument = "CONTEÚDO JURÍDICO. ".repeat(30);

describe("pipeline de três camadas", () => {
  it("executa código, Haiku, RAG e Sonnet com até dois ciclos de revisão", async () => {
    const calls: string[] = [];
    let reviewCycle = 0;
    const anthropic = {
      call: vi.fn(async (input: { stage: string }) => {
        calls.push(input.stage);
        if (input.stage === "haiku_classificacao") {
          return {
            beneficio_rag: "incapacidade",
            palavras_chave_rag: ["pericia", "incapacidade temporaria"],
            tipo_beneficio: "Auxílio por incapacidade temporária",
            tipo_peca_recomendado: "Petição inicial",
            prioridade: "media",
            pontos_atencao: [],
            dados_faltantes: [],
          };
        }
        if (input.stage === "sonnet_analise") {
          return {
            resumo_caso: "Resumo",
            viabilidade: "media",
            estrutura_argumentativa: [],
            teses_aplicadas: ["auxilio-doenca-concessao"],
            calculos_relevantes: [],
            pedidos_sugeridos: ["Concessão"],
            alertas_estrategicos: [],
            campos_pendentes: [],
          };
        }
        if (input.stage.startsWith("sonnet_redacao") || input.stage.startsWith("sonnet_correcao")) {
          return {
            tipo_documento: "peticao",
            conteudo_documento: longDocument,
            campos_preencher: [],
            observacoes: [],
          };
        }

        reviewCycle += 1;
        return {
          status: reviewCycle === 1 ? "REPROVADO" : "APROVADO",
          ciclo: reviewCycle,
          checklist: {
            completude: reviewCycle === 1 ? "FALHA" : "OK",
            fundamentacao: "OK",
            linguagem: "OK",
            coerencia: "OK",
          },
          correcoes_obrigatorias:
            reviewCycle === 1
              ? [{ item: "Pedido", descricao: "Ausente", instrucao_redator: "Incluir" }]
              : [],
          correcoes_sugeridas: [],
          campos_preencher: [],
          observacoes: "Revisado",
        };
      }),
    } as unknown as TrackedAnthropicClient;

    const diagnostic = {
      run: vi.fn().mockResolvedValue({
        versao: "cnis-estrutural-v1",
        qualidade_extracao: "alta",
        paginas: 2,
        dados_pessoais: { nascimento: "1980-01-01", sexo: "F" },
        vinculos: [],
        remuneracoes: [],
        indicadores: [],
        calculos: {
          dias_contribuicao_sem_sobreposicao: 0,
          dias_contribuicao_ate_ec_103: 0,
          competencias_carencia: 0,
          periodos_concomitantes: 0,
          lacunas_superiores_30_dias: [],
        },
        alertas: [],
        confirmacoes_necessarias: [],
      }),
    } as unknown as CnisDiagnosticClient;

    const rag = {
      retrieve: vi.fn().mockResolvedValue([
        {
          id: "00000000-0000-4000-8000-000000000001",
          slug: "auxilio-doenca-concessao",
          titulo: "Auxílio-doença",
          beneficio: "incapacidade",
          resumo: "Resumo",
          requisitos: [],
          base_legal: [],
          jurisprudencia_chave: [],
          provas_necessarias: [],
          modelo_redacao: null,
          erros_comuns: [],
          similaridade: 0.9,
        },
      ]),
    } as unknown as ThesisRagService;
    const stages: string[] = [];

    const result = await runGenerationPipeline(
      {
        caso: {
          id: "00000000-0000-4000-8000-000000000002",
          escritorio_id: "00000000-0000-4000-8000-000000000003",
          cliente_final: "Cliente",
          beneficio: "incapacidade",
          tipo_peca: "inicial",
          formato: "tradicional",
          pesquisou_juris: false,
          fatos: "Fatos",
          pedidos: ["Concessão"],
          inputs: {},
        },
        tipoOperacao: "peticao",
        signedCnisUrl: "https://storage.invalid/signed",
      },
      {
        anthropic,
        diagnostic,
        rag,
        onProgress: async (stage) => {
          stages.push(stage);
        },
      },
    );

    expect(calls).toEqual([
      "haiku_classificacao",
      "sonnet_analise",
      "sonnet_redacao",
      "sonnet_revisao_ciclo_1",
      "sonnet_correcao_ciclo_1",
      "sonnet_revisao_ciclo_2",
    ]);
    expect(result.teses).toHaveLength(1);
    expect(result.revisao).toMatchObject({ status: "APROVADO", ciclo: 2 });
    expect(stages.at(-1)).toBe("concluida");
  });
});

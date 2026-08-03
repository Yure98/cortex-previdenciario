import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { generateDeliveryDocx } from "@/lib/docx/generator";
import type { DocxGenerationInput } from "@/lib/docx/types";

function usage(): never {
  throw new Error("Uso: npm run docx:qa -- <timbrado.docx> <diretorio-saida>");
}

function syntheticInput(format: "tradicional" | "visual_law"): DocxGenerationInput {
  const paragraphs = Array.from(
    { length: 18 },
    (_, index) =>
      `Parágrafo jurídico sintético ${index + 1}. Este texto existe apenas para validar paginação, margens, cabeçalhos, rodapés e marca-d'água. Nenhum dado pessoal real é utilizado neste ensaio.`,
  ).join("\n\n");
  return {
    geracaoId: "30000000-0000-4000-8000-000000000003",
    generatedAt: new Date("2026-08-03T12:00:00.000Z"),
    escritorio: {
      id: "10000000-0000-4000-8000-000000000001",
      nome: "Escritório de Demonstração",
      oab: "OAB/SE 0000",
      cidade: "Aracaju/SE",
      timbradoPath: "10000000-0000-4000-8000-000000000001/timbrado.docx",
      corPrimaria: "#111111",
      corSecundaria: "#f5f5f5",
      corAcento: "#3b82f6",
    },
    caso: {
      id: "20000000-0000-4000-8000-000000000002",
      escritorio_id: "10000000-0000-4000-8000-000000000001",
      cliente_final: "Cliente de Demonstração",
      beneficio: "incapacidade",
      tipo_peca: "petição inicial",
      formato: format,
      pesquisou_juris: false,
      fatos: "Conteúdo sintético.",
      pedidos: ["Pedido sintético"],
      inputs: {},
    },
    resultado: {
      diagnostico: {
        versao: "cnis-estrutural-v1",
        qualidade_extracao: "alta",
        paginas: 2,
        dados_pessoais: { nascimento: null, sexo: null },
        vinculos: [
          {
            empregador: "Vínculo demonstrativo A",
            inicio: "2016-01-01",
            fim: "2019-12-31",
            dias_no_intervalo: 1461,
            indicadores: ["Indicador demonstrativo"],
          },
          {
            empregador: "Vínculo demonstrativo B",
            inicio: "2020-01-01",
            fim: "2024-12-31",
            dias_no_intervalo: 1827,
            indicadores: [],
          },
        ],
        remuneracoes: [],
        indicadores: [],
        calculos: {
          dias_contribuicao_sem_sobreposicao: 3288,
          dias_contribuicao_ate_ec_103: 1412,
          competencias_carencia: 108,
          periodos_concomitantes: 0,
          lacunas_superiores_30_dias: [],
        },
        alertas: [],
        confirmacoes_necessarias: [],
      },
      classificacao: {
        beneficio_rag: "incapacidade",
        palavras_chave_rag: ["pericia"],
        tipo_beneficio: "Benefício demonstrativo",
        tipo_peca_recomendado: "Petição inicial",
        prioridade: "media",
        pontos_atencao: [],
        dados_faltantes: [],
      },
      teses: [],
      analise: {
        resumo_caso:
          "Caso inteiramente sintético usado para validar o gerador DOCX da Fase 3.",
        viabilidade: "media",
        estrutura_argumentativa: [
          {
            titulo: "Demonstração",
            tese: "Tese sintética",
            bases_legais: ["Base legal sintética"],
            provas: ["Documento médico [CONFERIR]", "Extrato previdenciário"],
            riscos: ["Confirmar datas"],
          },
        ],
        teses_aplicadas: [],
        calculos_relevantes: [],
        pedidos_sugeridos: ["Pedido sintético"],
        alertas_estrategicos: ["Confirmar o marco temporal antes do protocolo."],
        campos_pendentes: ["Data do requerimento"],
      },
      minuta: {
        tipo_documento: "peticao",
        conteudo_documento: [
          "AO JUÍZO COMPETENTE",
          "DOS FATOS",
          paragraphs,
          "DOS FUNDAMENTOS",
          paragraphs,
          "DOS PEDIDOS",
          "1. Recebimento da presente minuta;\n2. Conferência humana obrigatória;\n3. Adequação dos campos [CONFERIR].",
        ].join("\n\n"),
        campos_preencher: ["Data do requerimento"],
        observacoes: [],
      },
      revisao: {
        status: "APROVADO_COM_RESSALVAS",
        ciclo: 1,
        checklist: {
          completude: "ATENCAO",
          fundamentacao: "OK",
          linguagem: "OK",
          coerencia: "OK",
        },
        correcoes_obrigatorias: [],
        correcoes_sugeridas: [],
        campos_preencher: ["Data do requerimento"],
        observacoes: "Revisão sintética.",
      },
    },
  };
}

async function main(): Promise<void> {
  const [templateArg, outputArg] = process.argv.slice(2);
  if (!templateArg || !outputArg) usage();
  const template = await readFile(resolve(templateArg));
  const outputDirectory = resolve(outputArg);
  await mkdir(outputDirectory, { recursive: true });

  const matrix = [
    { name: "tradicional-com-timbrado.docx", format: "tradicional" as const, template },
    { name: "visual-law-com-timbrado.docx", format: "visual_law" as const, template },
    { name: "tradicional-fallback-limpo.docx", format: "tradicional" as const, template: null },
    { name: "visual-law-fallback-limpo.docx", format: "visual_law" as const, template: null },
  ];

  const report = [];
  for (const item of matrix) {
    const generated = await generateDeliveryDocx(syntheticInput(item.format), item.template);
    const path = resolve(outputDirectory, item.name);
    await writeFile(path, generated.buffer);
    report.push({
      file: item.name,
      bytes: generated.buffer.byteLength,
      sha256: generated.sha256,
      usedTemplate: generated.usedTemplate,
      preflight: generated.preflight,
    });
  }
  await writeFile(
    resolve(outputDirectory, "qa-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}

await main();

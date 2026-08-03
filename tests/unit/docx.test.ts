import { createHash } from "node:crypto";

import {
  Document,
  Footer,
  Header,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";

import { createDeliveryFileName, sanitizeFileSegment } from "@/lib/docx/filename";
import { generateDeliveryDocx } from "@/lib/docx/generator";
import { preflightTemplate } from "@/lib/docx/preflight";
import type { DocxGenerationInput } from "@/lib/docx/types";

async function templateBuffer(): Promise<Buffer> {
  return Packer.toBuffer(
    new Document({
      sections: [
        {
          headers: {
            default: new Header({ children: [new Paragraph("CABEÇALHO IMUTÁVEL")] }),
          },
          footers: {
            default: new Footer({ children: [new Paragraph("RODAPÉ IMUTÁVEL")] }),
          },
          children: [
            new Paragraph({
              children: [
                new TextRun("{{CONTEUDO_"),
                new TextRun("PETICAO}}"),
              ],
            }),
          ],
        },
      ],
    }),
  );
}

function input(format: "tradicional" | "visual_law"): DocxGenerationInput {
  return {
    geracaoId: "00000000-0000-4000-8000-000000000003",
    generatedAt: new Date("2026-08-03T12:00:00.000Z"),
    escritorio: {
      id: "00000000-0000-4000-8000-000000000001",
      nome: "Escritório Teste",
      oab: "OAB/SE 0000",
      cidade: "Aracaju/SE",
      timbradoPath: "00000000-0000-4000-8000-000000000001/timbrado.docx",
      corPrimaria: "#111111",
      corSecundaria: "#f5f5f5",
      corAcento: "#3b82f6",
    },
    caso: {
      id: "00000000-0000-4000-8000-000000000002",
      escritorio_id: "00000000-0000-4000-8000-000000000001",
      cliente_final: "Maria da Silva / CPF 000",
      beneficio: "incapacidade",
      tipo_peca: "peticao inicial",
      formato: format,
      pesquisou_juris: false,
      fatos: "Fatos de teste.",
      pedidos: ["Concessão"],
      inputs: {},
    },
    resultado: {
      diagnostico: {
        versao: "cnis-estrutural-v1",
        qualidade_extracao: "alta",
        paginas: 1,
        dados_pessoais: { nascimento: null, sexo: null },
        vinculos: [
          {
            empregador: "EMPREGADOR TESTE",
            inicio: "2020-01-01",
            fim: "2021-01-01",
            dias_no_intervalo: 367,
            indicadores: ["INDICADOR"],
          },
        ],
        remuneracoes: [],
        indicadores: [],
        calculos: {
          dias_contribuicao_sem_sobreposicao: 367,
          dias_contribuicao_ate_ec_103: 0,
          competencias_carencia: 12,
          periodos_concomitantes: 0,
          lacunas_superiores_30_dias: [],
        },
        alertas: [],
        confirmacoes_necessarias: [],
      },
      classificacao: {
        beneficio_rag: "incapacidade",
        palavras_chave_rag: ["pericia"],
        tipo_beneficio: "Benefício por incapacidade",
        tipo_peca_recomendado: "Petição inicial",
        prioridade: "media",
        pontos_atencao: [],
        dados_faltantes: [],
      },
      teses: [],
      analise: {
        resumo_caso: "Resumo sintético do caso para leitura estratégica.",
        viabilidade: "media",
        estrutura_argumentativa: [
          {
            titulo: "Incapacidade",
            tese: "Tese de teste",
            bases_legais: ["Lei de teste"],
            provas: ["Laudo médico [CONFERIR]"],
            riscos: [],
          },
        ],
        teses_aplicadas: [],
        calculos_relevantes: [],
        pedidos_sugeridos: ["Concessão"],
        alertas_estrategicos: ["Confirmar a data de início da incapacidade."],
        campos_pendentes: ["Data da perícia"],
      },
      minuta: {
        tipo_documento: "peticao",
        conteudo_documento:
          "AO JUÍZO COMPETENTE\n\nDOS FATOS\n\nConteúdo jurídico sintético para validar o documento. [CONFERIR]\n\n- Documento médico\n- CNIS atualizado",
        campos_preencher: [],
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
        campos_preencher: ["Data da perícia"],
        observacoes: "Revisado",
      },
    },
  };
}

function sha(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("geração DOCX da Fase 3", () => {
  it("sanitiza o nome sem permitir caminho ou caracteres do cliente", () => {
    expect(sanitizeFileSegment("  João D'Ávila / ../../segredo  ")).toBe(
      "joao_d_avila_segredo",
    );
    expect(createDeliveryFileName("João D'Ávila", new Date("2026-08-03T00:00:00Z"))).toBe(
      "peticao_joao_d_avila_2026-08-03.docx",
    );
  });

  it("aceita marcador dividido e preserva header/footer do template por hash", async () => {
    const template = await templateBuffer();
    const before = await JSZip.loadAsync(template);
    const generated = await generateDeliveryDocx(input("tradicional"), template);
    const after = await JSZip.loadAsync(generated.buffer);
    const documentXml = await after.file("word/document.xml")!.async("string");

    expect(documentXml).toContain("Conteúdo jurídico sintético");
    expect(documentXml).not.toContain("CONTEUDO_PETICAO");
    for (const part of ["word/header1.xml", "word/footer1.xml"]) {
      expect(sha(await after.file(part)!.async("uint8array"))).toBe(
        sha(await before.file(part)!.async("uint8array")),
      );
    }
    expect(generated.preflight?.warnings).toContain("MARCADOR_DIVIDIDO_EM_RUNS_NORMALIZADO");
  });

  it("gera fallback limpo e Visual Law com sumário, timeline, provas e boxes", async () => {
    const generated = await generateDeliveryDocx(input("visual_law"), null);
    const zip = await JSZip.loadAsync(generated.buffer);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    const headerXml = await zip.file("word/header1.xml")!.async("string");

    expect(generated.usedTemplate).toBe(false);
    expect(headerXml).toContain("Escritório Teste");
    expect(documentXml).toContain("SUMÁRIO VISUAL");
    expect(documentXml).toContain("LINHA DO TEMPO CONTRIBUTIVA");
    expect(documentXml).toContain("PROVAS E PENDÊNCIAS");
    expect(documentXml.match(/<w:tbl>/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("normaliza separadores internos fora do padrão", async () => {
    const standard = await JSZip.loadAsync(await templateBuffer());
    const broken = new JSZip();
    for (const [name, entry] of Object.entries(standard.files)) {
      if (entry.dir) continue;
      broken.file(name.replaceAll("/", "\\"), await entry.async("uint8array"));
    }
    const report = await preflightTemplate(await broken.generateAsync({ type: "nodebuffer" }));
    expect(report.report.normalizedEntryNames).toBeGreaterThan(0);
    expect(report.zip.file("word/document.xml")).not.toBeNull();
  });
});

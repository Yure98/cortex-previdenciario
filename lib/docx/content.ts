import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  LevelFormat,
  PageNumber,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlignTable,
  WidthType,
} from "docx";

import type { DocxGenerationInput } from "@/lib/docx/types";

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const PAGE_MARGIN = 1440;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const BODY_FONT = "Times New Roman";
const VISUAL_FONT = "Arial";
const CHECK_MARKER = "[CONFERIR]";

type Block = Paragraph | Table;

function withoutHash(color: string): string {
  return color.replace(/^#/, "").toUpperCase();
}

function textRuns(
  text: string,
  options: { bold?: boolean; size?: number; font?: string; color?: string } = {},
): TextRun[] {
  const parts = text.split(CHECK_MARKER);
  const runs: TextRun[] = [];
  parts.forEach((part, index) => {
    if (part) {
      runs.push(
        new TextRun({
          text: part,
          bold: options.bold,
          size: options.size,
          font: options.font,
          color: options.color,
        }),
      );
    }
    if (index < parts.length - 1) {
      runs.push(
        new TextRun({
          text: CHECK_MARKER,
          bold: true,
          size: options.size,
          font: options.font,
          color: "7A4D00",
          highlight: "yellow",
        }),
      );
    }
  });
  return runs.length > 0 ? runs : [new TextRun({ text: "" })];
}

function heading(text: string, visual: boolean, level: 1 | 2 = 1): Paragraph {
  return new Paragraph({
    children: textRuns(text, {
      bold: true,
      size: level === 1 ? 30 : 26,
      font: visual ? VISUAL_FONT : BODY_FONT,
      color: "111111",
    }),
    spacing: { before: level === 1 ? 300 : 220, after: 120, line: 276 },
    keepNext: true,
    outlineLevel: level - 1,
  });
}

function bodyParagraph(text: string, visual: boolean): Paragraph {
  return new Paragraph({
    children: textRuns(text, {
      size: visual ? 22 : 24,
      font: visual ? VISUAL_FONT : BODY_FONT,
      color: "222222",
    }),
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 160, line: visual ? 300 : 360 },
    indent: { firstLine: visual ? 0 : 708 },
    widowControl: true,
  });
}

function parseLegalContent(content: string, visual: boolean): Block[] {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  const chunks = normalized.split(/\n\s*\n/).map((chunk) => chunk.trim()).filter(Boolean);
  const blocks: Block[] = [];

  for (const chunk of chunks) {
    const singleLine = chunk.replace(/\s*\n\s*/g, " ").trim();
    const markdownHeading = singleLine.match(/^#{1,3}\s+(.+)$/);
    const isShortUppercase =
      singleLine.length <= 140 &&
      /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(singleLine) &&
      singleLine === singleLine.toLocaleUpperCase("pt-BR");

    if (markdownHeading || isShortUppercase) {
      blocks.push(heading(markdownHeading?.[1] ?? singleLine, visual, 1));
      continue;
    }

    const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
    if (lines.every((line) => /^[-*•]\s+/.test(line))) {
      for (const line of lines) {
        blocks.push(
          new Paragraph({
            children: textRuns(line.replace(/^[-*•]\s+/, ""), {
              size: visual ? 22 : 24,
              font: visual ? VISUAL_FONT : BODY_FONT,
            }),
            numbering: { reference: "cortex-bullet", level: 0 },
            spacing: { after: 90, line: visual ? 300 : 340 },
          }),
        );
      }
      continue;
    }

    if (lines.every((line) => /^\d+[.)]\s+/.test(line))) {
      for (const line of lines) {
        blocks.push(
          new Paragraph({
            children: textRuns(line.replace(/^\d+[.)]\s+/, ""), {
              size: visual ? 22 : 24,
              font: visual ? VISUAL_FONT : BODY_FONT,
            }),
            numbering: { reference: "cortex-number", level: 0 },
            spacing: { after: 90, line: visual ? 300 : 340 },
          }),
        );
      }
      continue;
    }

    blocks.push(bodyParagraph(singleLine, visual));
  }

  return blocks;
}

function callout(label: string, value: string, accent: string): Table {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    indent: { size: 0, type: WidthType.DXA },
    margins: { top: 180, bottom: 180, left: 220, right: 220 },
    borders: {
      top: { style: BorderStyle.SINGLE, color: accent, size: 8 },
      bottom: { style: BorderStyle.SINGLE, color: accent, size: 8 },
      left: { style: BorderStyle.SINGLE, color: accent, size: 24 },
      right: { style: BorderStyle.SINGLE, color: accent, size: 8 },
      insideHorizontal: { style: BorderStyle.NIL, color: "FFFFFF", size: 0 },
      insideVertical: { style: BorderStyle.NIL, color: "FFFFFF", size: 0 },
    },
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { fill: "F7F7F7", type: ShadingType.CLEAR },
            verticalAlign: VerticalAlignTable.CENTER,
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: `${label}\n`, bold: true, size: 20, font: VISUAL_FONT }),
                  ...textRuns(value, { size: 21, font: VISUAL_FONT, color: "333333" }),
                ],
                spacing: { after: 0, line: 280 },
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function tableCell(
  text: string,
  width: number,
  options: { header?: boolean; fill?: string; align?: "left" | "center" } = {},
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: options.fill ? { fill: options.fill, type: ShadingType.CLEAR } : undefined,
    verticalAlign: VerticalAlignTable.CENTER,
    margins: { top: 130, bottom: 130, left: 150, right: 150 },
    children: [
      new Paragraph({
        alignment: options.align === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
        children: textRuns(text || "—", {
          bold: options.header,
          size: options.header ? 19 : 18,
          font: VISUAL_FONT,
          color: options.header ? "FFFFFF" : "222222",
        }),
        spacing: { after: 0, line: 250 },
      }),
    ],
  });
}

function dataTable(headers: string[], widths: number[], rows: string[][], primary: string): Table {
  const borders = {
    top: { style: BorderStyle.SINGLE, color: "D7D7D7", size: 4 },
    bottom: { style: BorderStyle.SINGLE, color: "D7D7D7", size: 4 },
    left: { style: BorderStyle.SINGLE, color: "D7D7D7", size: 4 },
    right: { style: BorderStyle.SINGLE, color: "D7D7D7", size: 4 },
    insideHorizontal: { style: BorderStyle.SINGLE, color: "E5E5E5", size: 3 },
    insideVertical: { style: BorderStyle.SINGLE, color: "E5E5E5", size: 3 },
  };
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    indent: { size: 0, type: WidthType.DXA },
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    borders,
    rows: [
      new TableRow({
        cantSplit: true,
        tableHeader: true,
        children: headers.map((header, index) =>
          tableCell(header, widths[index], { header: true, fill: primary, align: "center" }),
        ),
      }),
      ...rows.map(
        (row, rowIndex) =>
          new TableRow({
            cantSplit: true,
            children: row.map((value, index) =>
              tableCell(value, widths[index], { fill: rowIndex % 2 === 1 ? "FAFAFA" : "FFFFFF" }),
            ),
          }),
      ),
    ],
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function visualLawBlocks(input: DocxGenerationInput): Block[] {
  const primary = withoutHash(input.escritorio.corPrimaria);
  const accent = withoutHash(input.escritorio.corAcento);
  const links = input.resultado.diagnostico.vinculos.slice(0, 30).map((link) => [
    `${link.inicio} a ${link.fim ?? "em aberto"}`,
    link.empregador ?? "Não identificado",
    link.indicadores.length ? link.indicadores.join(", ") : "Sem indicador",
  ]);
  const evidence = unique([
    ...input.resultado.analise.estrutura_argumentativa.flatMap((item) => item.provas),
    ...input.resultado.analise.campos_pendentes,
    ...input.resultado.revisao.campos_preencher,
  ]).slice(0, 30);
  const evidenceRows = evidence.map((item) => [item, "Pendente de conferência"]);
  const blocks: Block[] = [
    heading("LEITURA ESTRATÉGICA DO CASO", true, 1),
    callout("RESUMO EXECUTIVO", input.resultado.analise.resumo_caso, accent),
    new Paragraph({ text: "", spacing: { after: 80 } }),
    heading("SUMÁRIO VISUAL", true, 2),
    dataTable(
      ["ETAPA", "CONTEÚDO"],
      [1700, CONTENT_WIDTH - 1700],
      [
        ["01", "Resumo executivo e viabilidade"],
        ["02", "Linha do tempo contributiva"],
        ["03", "Quadro de provas e pendências"],
        ["04", "Fundamentação, pedidos e minuta"],
      ],
      primary,
    ),
    heading("LINHA DO TEMPO CONTRIBUTIVA", true, 2),
    links.length
      ? dataTable(
          ["PERÍODO", "VÍNCULO", "INDICADORES"],
          [2200, 3300, CONTENT_WIDTH - 5500],
          links,
          primary,
        )
      : callout("LINHA DO TEMPO", "Nenhum vínculo estruturado foi identificado no CNIS.", accent),
    heading("PROVAS E PENDÊNCIAS", true, 2),
    evidenceRows.length
      ? dataTable(
          ["ITEM", "STATUS"],
          [CONTENT_WIDTH - 2600, 2600],
          evidenceRows,
          primary,
        )
      : callout("PROVAS", "Não foram registradas pendências adicionais na análise.", accent),
  ];

  for (const warning of input.resultado.analise.alertas_estrategicos.slice(0, 8)) {
    blocks.push(new Paragraph({ text: "", spacing: { after: 40 } }));
    blocks.push(callout("PONTO DE ATENÇÃO", warning, "F59E0B"));
  }
  blocks.push(heading("MINUTA JURÍDICA", true, 1));
  blocks.push(...parseLegalContent(input.resultado.minuta.conteudo_documento, true));
  return blocks;
}

function traditionalBlocks(input: DocxGenerationInput): Block[] {
  return parseLegalContent(input.resultado.minuta.conteudo_documento, false);
}

function fallbackHeader(input: DocxGenerationInput): Header {
  const secondary = [input.escritorio.oab, input.escritorio.cidade].filter(Boolean).join(" · ");
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: input.escritorio.nome, bold: true, size: 24, font: VISUAL_FONT }),
          ...(secondary
            ? [new TextRun({ text: `\n${secondary}`, size: 18, color: "666666", font: VISUAL_FONT })]
            : []),
        ],
        spacing: { after: 80 },
        border: {
          bottom: { style: BorderStyle.SINGLE, color: "D9D9D9", size: 6, space: 8 },
        },
      }),
    ],
  });
}

function fallbackFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: "Minuta assistida por IA · Revisão humana obrigatória · Página ", size: 16, color: "777777", font: VISUAL_FONT }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "777777", font: VISUAL_FONT }),
        ],
      }),
    ],
  });
}

export async function createContentDocument(
  input: DocxGenerationInput,
  includeFallbackBranding: boolean,
): Promise<Buffer> {
  const blocks =
    input.caso.formato === "visual_law" ? visualLawBlocks(input) : traditionalBlocks(input);
  const document = new Document({
    creator: "Córtex Previdenciário",
    title: input.resultado.minuta.tipo_documento === "peticao" ? "Petição" : "Relatório CNIS",
    description: "Minuta assistida por IA; revisão humana obrigatória.",
    features: { updateFields: true },
    numbering: {
      config: [
        {
          reference: "cortex-bullet",
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: "•",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
        {
          reference: "cortex-number",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: {
              top: PAGE_MARGIN,
              right: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
              header: 720,
              footer: 720,
            },
          },
        },
        headers: includeFallbackBranding ? { default: fallbackHeader(input) } : undefined,
        footers: includeFallbackBranding ? { default: fallbackFooter() } : undefined,
        children: blocks,
      },
    ],
  });

  return Packer.toBuffer(document);
}

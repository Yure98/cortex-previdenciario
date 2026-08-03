import JSZip from "jszip";

import { EngineError } from "@/lib/engine/errors";
import { preflightTemplate } from "@/lib/docx/preflight";
import type { DocxPreflightReport } from "@/lib/docx/types";

const MARKER = "{{CONTEUDO_PETICAO}}";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NUMBERING_REL = `${WORD_NS.replace("wordprocessingml/2006/main", "officeDocument/2006/relationships")}/numbering`;
const NUMBERING_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXmlText(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function wordPrefix(xml: string): string {
  const match = xml.match(
    new RegExp(`xmlns:([A-Za-z_][\\w.-]*)=["']${escapeRegex(WORD_NS)}["']`),
  );
  if (!match?.[1]) throw new EngineError("DOCX_INVALIDO", "Namespace Word não encontrado.");
  return match[1];
}

function extractBody(documentXml: string): string {
  const prefix = wordPrefix(documentXml);
  const escaped = escapeRegex(prefix);
  const body = documentXml.match(
    new RegExp(`<${escaped}:body(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}:body>`),
  )?.[1];
  if (!body) throw new EngineError("DOCX_INVALIDO", "O conteúdo gerado não possui corpo Word.");
  return body
    .replace(new RegExp(`<${escaped}:sectPr(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escaped}:sectPr>\\s*$`), "")
    .replace(/<w:pStyle\b[^>]*w:val=["']ListParagraph["'][^>]*\/>/g, "")
    .trim();
}

function replaceMarkerParagraph(templateXml: string, fragment: string): string {
  const prefix = wordPrefix(templateXml);
  const escaped = escapeRegex(prefix);
  const paragraphPattern = new RegExp(
    `<${escaped}:p(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escaped}:p>`,
    "g",
  );
  let replacements = 0;
  const output = templateXml.replace(paragraphPattern, (paragraph) => {
    const text = [...paragraph.matchAll(
      new RegExp(`<${escaped}:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}:t>`, "g"),
    )]
      .map((match) => decodeXmlText(match[1] ?? ""))
      .join("")
      .trim();
    if (text !== MARKER) return paragraph;
    replacements += 1;
    return fragment;
  });
  if (replacements !== 1) {
    throw new EngineError("TIMBRADO_INVALIDO", "Não foi possível localizar o marcador único.");
  }
  return output;
}

function numericAttributeValues(xml: string, element: string, attribute: string): number[] {
  const pattern = new RegExp(`<w:${element}\\b[^>]*w:${attribute}=["'](\\d+)["']`, "g");
  return [...xml.matchAll(pattern)].map((match) => Number(match[1]));
}

function maxOrZero(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

async function mergeNumbering(
  templateZip: JSZip,
  generatedZip: JSZip,
  bodyFragment: string,
): Promise<string> {
  const usedNumIds = [...bodyFragment.matchAll(/<w:numId\b[^>]*w:val=["'](\d+)["']/g)].map(
    (match) => Number(match[1]),
  );
  if (!usedNumIds.length) return bodyFragment;

  const generatedFile = generatedZip.file("word/numbering.xml");
  if (!generatedFile) {
    throw new EngineError("DOCX_INVALIDO", "A numeração do conteúdo gerado não foi encontrada.");
  }
  const generatedNumbering = await generatedFile.async("string");
  const uniqueUsedNumIds = [...new Set(usedNumIds)];
  const numDefinitions = new Map<number, string>();
  const abstractByNum = new Map<number, number>();

  for (const numId of uniqueUsedNumIds) {
    const definition = generatedNumbering.match(
      new RegExp(`<w:num\\b[^>]*w:numId=["']${numId}["'][^>]*>[\\s\\S]*?<\\/w:num>`),
    )?.[0];
    const abstractId = definition?.match(/<w:abstractNumId\b[^>]*w:val=["'](\d+)["']/)?.[1];
    if (!definition || abstractId === undefined) {
      throw new EngineError("DOCX_INVALIDO", "A definição de numeração está incompleta.");
    }
    numDefinitions.set(numId, definition);
    abstractByNum.set(numId, Number(abstractId));
  }

  const abstractIds = [...new Set(abstractByNum.values())];
  const abstractDefinitions = new Map<number, string>();
  for (const abstractId of abstractIds) {
    const definition = generatedNumbering.match(
      new RegExp(
        `<w:abstractNum\\b[^>]*w:abstractNumId=["']${abstractId}["'][^>]*>[\\s\\S]*?<\\/w:abstractNum>`,
      ),
    )?.[0];
    if (!definition) throw new EngineError("DOCX_INVALIDO", "Numeração abstrata ausente.");
    abstractDefinitions.set(abstractId, definition);
  }

  const templateFile = templateZip.file("word/numbering.xml");
  const templateNumbering = templateFile
    ? await templateFile.async("string")
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${WORD_NS}"></w:numbering>`;
  let nextAbstract = maxOrZero(numericAttributeValues(templateNumbering, "abstractNum", "abstractNumId")) + 1;
  let nextNum = maxOrZero(numericAttributeValues(templateNumbering, "num", "numId")) + 1;
  const abstractMap = new Map<number, number>();
  const numMap = new Map<number, number>();
  for (const id of abstractIds) abstractMap.set(id, nextAbstract++);
  for (const id of uniqueUsedNumIds) numMap.set(id, nextNum++);

  const additions: string[] = [];
  for (const [oldId, definition] of abstractDefinitions) {
    additions.push(
      definition.replace(
        new RegExp(`(w:abstractNumId=["'])${oldId}(["'])`),
        `$1${abstractMap.get(oldId)}$2`,
      ),
    );
  }
  for (const [oldId, definition] of numDefinitions) {
    const oldAbstract = abstractByNum.get(oldId)!;
    additions.push(
      definition
        .replace(new RegExp(`(w:numId=["'])${oldId}(["'])`), `$1${numMap.get(oldId)}$2`)
        .replace(
          new RegExp(`(<w:abstractNumId\\b[^>]*w:val=["'])${oldAbstract}(["'])`),
          `$1${abstractMap.get(oldAbstract)}$2`,
        ),
    );
  }

  const additionsXml = additions.join("");
  const mergedNumbering = templateNumbering.includes("</w:numbering>")
    ? templateNumbering.replace("</w:numbering>", `${additionsXml}</w:numbering>`)
    : templateNumbering.replace(/<w:numbering([^>]*)\/>/, `<w:numbering$1>${additionsXml}</w:numbering>`);
  if (mergedNumbering === templateNumbering) {
    throw new EngineError("TIMBRADO_INVALIDO", "Não foi possível ampliar a numeração do timbrado.");
  }
  templateZip.file("word/numbering.xml", mergedNumbering);

  let remapped = bodyFragment;
  for (const [oldId, newId] of numMap) {
    remapped = remapped.replace(
      new RegExp(`(<w:numId\\b[^>]*w:val=["'])${oldId}(["'])`, "g"),
      `$1${newId}$2`,
    );
  }

  if (!templateFile) {
    const contentTypesFile = templateZip.file("[Content_Types].xml")!;
    let contentTypes = await contentTypesFile.async("string");
    if (!contentTypes.includes('PartName="/word/numbering.xml"')) {
      contentTypes = contentTypes.replace(
        /<\/Types>\s*$/,
        `<Override PartName="/word/numbering.xml" ContentType="${NUMBERING_CONTENT_TYPE}"/></Types>`,
      );
      templateZip.file("[Content_Types].xml", contentTypes);
    }

    const relationshipsPath = "word/_rels/document.xml.rels";
    const relationshipsFile = templateZip.file(relationshipsPath);
    if (!relationshipsFile) {
      throw new EngineError("TIMBRADO_INVALIDO", "Relacionamentos do documento ausentes.");
    }
    let relationships = await relationshipsFile.async("string");
    if (!relationships.includes(NUMBERING_REL)) {
      const ids = [...relationships.matchAll(/Id=["']rId(\d+)["']/g)].map((match) => Number(match[1]));
      const nextRelationship = maxOrZero(ids) + 1;
      relationships = relationships.replace(
        /<\/Relationships>\s*$/,
        `<Relationship Id="rId${nextRelationship}" Type="${NUMBERING_REL}" Target="numbering.xml"/></Relationships>`,
      );
      templateZip.file(relationshipsPath, relationships);
    }
  }

  return remapped;
}

export async function applyContentToTemplate(
  templateBuffer: Buffer,
  generatedContentBuffer: Buffer,
): Promise<{ buffer: Buffer; preflight: DocxPreflightReport }> {
  const preflight = await preflightTemplate(templateBuffer);
  const generatedZip = await JSZip.loadAsync(generatedContentBuffer, { checkCRC32: true });
  const generatedDocument = await generatedZip.file("word/document.xml")?.async("string");
  if (!generatedDocument) {
    throw new EngineError("DOCX_INVALIDO", "O documento de conteúdo não possui document.xml.");
  }

  let fragment = extractBody(generatedDocument);
  fragment = await mergeNumbering(preflight.zip, generatedZip, fragment);
  const outputDocument = replaceMarkerParagraph(preflight.documentXml, fragment);
  preflight.zip.file("word/document.xml", outputDocument);
  const buffer = await preflight.zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    platform: "UNIX",
  });
  return { buffer, preflight: preflight.report };
}

import JSZip from "jszip";
import { SaxesParser } from "saxes";

import { EngineError } from "@/lib/engine/errors";
import type { DocxPreflightReport } from "@/lib/docx/types";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ENTRY_COUNT = 512;
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const MARKER = "{{CONTEUDO_PETICAO}}";
const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

interface UnsafeZipEntry extends JSZip.JSZipObject {
  unsafeOriginalName?: string;
}

export interface PreflightResult {
  zip: JSZip;
  documentXml: string;
  report: DocxPreflightReport;
}

function docxInvalid(message: string, cause?: unknown): EngineError {
  return new EngineError("TIMBRADO_INVALIDO", message, { cause });
}

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
  const namespace = xml.match(
    new RegExp(`xmlns:([A-Za-z_][\\w.-]*)=["']${escapeRegex(WORD_NS)}["']`),
  );
  if (!namespace?.[1]) {
    throw docxInvalid("O documento não declara o namespace WordprocessingML.");
  }
  return namespace[1];
}

function assertXml(part: string, xml: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw docxInvalid(`A parte ${part} contém declaração XML não permitida.`);
  }
  try {
    new SaxesParser({ xmlns: true }).write(xml).close();
  } catch (error) {
    throw docxInvalid(`A parte ${part} contém XML inválido.`, error);
  }
}

function assertGeneratedXml(part: string, xml: string): void {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) {
    throw new EngineError(
      "DOCX_INVALIDO",
      `O DOCX gerado contém declaração XML não permitida em ${part}.`,
    );
  }
  try {
    new SaxesParser({ xmlns: true }).write(xml).close();
  } catch (error) {
    throw new EngineError("DOCX_INVALIDO", `O DOCX gerado contém XML inválido em ${part}.`, {
      cause: error,
    });
  }
}

function inspectMarker(documentXml: string): {
  markerParagraphs: number;
  splitAcrossRuns: boolean;
} {
  const prefix = wordPrefix(documentXml);
  const escaped = escapeRegex(prefix);
  const paragraphs = documentXml.match(
    new RegExp(`<${escaped}:p(?:\\s[^>]*)?>[\\s\\S]*?<\\/${escaped}:p>`, "g"),
  ) ?? [];
  let markerParagraphs = 0;
  let splitAcrossRuns = false;

  for (const paragraph of paragraphs) {
    const values = [...paragraph.matchAll(
      new RegExp(`<${escaped}:t(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}:t>`, "g"),
    )].map((match) => decodeXmlText(match[1] ?? ""));
    const text = values.join("").trim();
    if (text === MARKER) {
      markerParagraphs += 1;
      if (!paragraph.includes(MARKER)) splitAcrossRuns = true;
    } else if (text.includes(MARKER)) {
      throw docxInvalid("O marcador precisa ocupar sozinho o seu parágrafo no timbrado.");
    }
  }

  return { markerParagraphs, splitAcrossRuns };
}

function normalizePageMeasurements(documentXml: string, prefix: string): {
  xml: string;
  changes: number;
} {
  const escaped = escapeRegex(prefix);
  const elementPattern = new RegExp(`<${escaped}:(pgMar|pgSz)\\b[^>]*>`, "g");
  let changes = 0;
  const xml = documentXml.replace(elementPattern, (element) =>
    element.replace(
      new RegExp(`((?:${escaped}:)?(?:top|right|bottom|left|header|footer|gutter|w|h)=["'])(-?\\d+\\.\\d+)(["'])`, "g"),
      (_match, before: string, numeric: string, after: string) => {
        changes += 1;
        return `${before}${Math.round(Number(numeric))}${after}`;
      },
    ),
  );
  return { xml, changes };
}

function validateContentTypes(xml: string): void {
  const mainType =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  if (!xml.includes(mainType)) {
    throw docxInvalid("O pacote não é um DOCX padrão sem macros.");
  }
}

export async function preflightTemplate(buffer: Buffer): Promise<PreflightResult> {
  if (buffer.byteLength === 0 || buffer.byteLength > MAX_ARCHIVE_BYTES) {
    throw docxInvalid("O timbrado precisa ter entre 1 byte e 50 MB.");
  }

  let source: JSZip;
  try {
    source = await JSZip.loadAsync(buffer, { checkCRC32: true });
  } catch (error) {
    throw docxInvalid("O timbrado não é um pacote ZIP/DOCX íntegro.", error);
  }

  const entries = Object.values(source.files) as UnsafeZipEntry[];
  if (entries.length > MAX_ENTRY_COUNT) {
    throw docxInvalid("O timbrado excede o limite de 512 entradas internas.");
  }

  const normalized = new JSZip();
  const seen = new Set<string>();
  let normalizedEntryNames = 0;
  let uncompressedBytes = 0;
  let entryCount = 0;

  for (const entry of entries) {
    const rawName = entry.unsafeOriginalName ?? entry.name;
    const name = rawName.replaceAll("\\", "/").replace(/^\/+/, "");
    const parts = name.split("/");
    if (!name || name.includes("\0") || parts.some((part) => part === "..")) {
      throw docxInvalid("O timbrado contém caminho interno inseguro.");
    }
    if (seen.has(name)) {
      throw docxInvalid("O timbrado contém entradas duplicadas após normalização.");
    }
    seen.add(name);
    if (rawName !== name) normalizedEntryNames += 1;
    if (entry.dir) continue;

    const forbidden = /(^|\/)(vbaProject\.bin|activeX|embeddings)(\/|$)/i;
    if (forbidden.test(name)) {
      throw docxInvalid("Macros, ActiveX e objetos incorporados não são aceitos no timbrado.");
    }

    const data = await entry.async("uint8array");
    if (data.byteLength > MAX_ENTRY_BYTES) {
      throw docxInvalid(`A entrada interna ${name} excede 32 MB.`);
    }
    uncompressedBytes += data.byteLength;
    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw docxInvalid("O conteúdo descompactado do timbrado excede 128 MB.");
    }
    entryCount += 1;
    normalized.file(name, data, { date: entry.date });
  }

  const required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
  for (const part of required) {
    if (!normalized.file(part)) {
      throw docxInvalid(`O timbrado não contém a parte obrigatória ${part}.`);
    }
  }

  const contentTypes = await normalized.file("[Content_Types].xml")!.async("string");
  assertXml("[Content_Types].xml", contentTypes);
  validateContentTypes(contentTypes);

  for (const name of Object.keys(normalized.files).filter((value) => /\.(xml|rels)$/.test(value))) {
    const xml = await normalized.file(name)!.async("string");
    assertXml(name, xml);
  }

  let documentXml = await normalized.file("word/document.xml")!.async("string");
  const prefix = wordPrefix(documentXml);
  const normalizedMeasurements = normalizePageMeasurements(documentXml, prefix);
  documentXml = normalizedMeasurements.xml;
  normalized.file("word/document.xml", documentXml);

  const marker = inspectMarker(documentXml);
  if (marker.markerParagraphs !== 1) {
    throw docxInvalid(
      `O timbrado precisa conter exatamente um marcador ${MARKER}; encontrados: ${marker.markerParagraphs}.`,
    );
  }

  const headerReferenceCount = (
    documentXml.match(new RegExp(`<${escapeRegex(prefix)}:headerReference\\b`, "g")) ?? []
  ).length;
  const warnings: string[] = [];
  if (marker.splitAcrossRuns) warnings.push("MARCADOR_DIVIDIDO_EM_RUNS_NORMALIZADO");
  if (normalizedEntryNames > 0) warnings.push("SEPARADORES_ZIP_NORMALIZADOS");
  if (normalizedMeasurements.changes > 0) warnings.push("MEDIDAS_OOXML_NORMALIZADAS");
  if (headerReferenceCount > 1) warnings.push("CABECALHO_COM_VARIANTES_REVISAR_PREVIEW");

  return {
    zip: normalized,
    documentXml,
    report: {
      normalizedEntryNames,
      normalizedMeasurements: normalizedMeasurements.changes,
      markerParagraphs: marker.markerParagraphs,
      entryCount,
      uncompressedBytes,
      warnings,
    },
  };
}

export async function validateGeneratedDocx(buffer: Buffer): Promise<void> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer, { checkCRC32: true });
  } catch (error) {
    throw new EngineError("DOCX_INVALIDO", "O arquivo DOCX gerado está corrompido.", {
      cause: error,
    });
  }
  const required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
  for (const part of required) {
    if (!zip.file(part)) {
      throw new EngineError("DOCX_INVALIDO", `O DOCX gerado não contém ${part}.`);
    }
  }
  for (const name of Object.keys(zip.files).filter((value) => /\.(xml|rels)$/.test(value))) {
    const xml = await zip.file(name)!.async("string");
    assertGeneratedXml(name, xml);
  }
  const documentXml = await zip.file("word/document.xml")!.async("string");
  if (documentXml.includes(MARKER) || documentXml.includes("CONTEUDO_PETICAO")) {
    throw new EngineError("DOCX_INVALIDO", "O marcador do timbrado permaneceu na entrega.");
  }
}

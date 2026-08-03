import { z } from "zod/v4";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const PDF_MIME = "application/pdf";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export const onboardingSchema = z.object({
  nome: z.string().trim().min(2).max(160),
  nomeUsuario: z.string().trim().min(2).max(160),
  oab: z.string().trim().max(80).optional(),
  cidade: z.string().trim().max(160).optional(),
  notebooklmUrl: z.union([z.literal(""), z.string().url().startsWith("https://")]),
  corPrimaria: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  corSecundaria: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  corAcento: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const newCaseSchema = z.object({
  clienteFinal: z.string().trim().min(2).max(200),
  beneficio: z.string().trim().min(2).max(120),
  tipoPeca: z.string().trim().min(2).max(120),
  fatos: z.string().trim().min(10).max(50_000),
  pedidos: z.string().trim().min(2).max(20_000),
  pesquisouJuris: z.enum(["sim", "nao"]),
  formato: z.enum(["tradicional", "visual_law"]),
});

export function assertUpload(file: File, kind: "docx" | "pdf"): void {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) throw new Error("ARQUIVO_TAMANHO_INVALIDO");
  const expected = kind === "docx" ? DOCX_MIME : PDF_MIME;
  if (file.type && file.type !== expected) throw new Error("ARQUIVO_TIPO_INVALIDO");
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(kind === "docx" ? ".docx" : ".pdf")) throw new Error("ARQUIVO_EXTENSAO_INVALIDA");
}

export function hasPdfSignature(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function hasZipSignature(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const requestOrigin = new URL(request.url).origin;
  const configuredOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : requestOrigin;
  return origin === requestOrigin || origin === configuredOrigin;
}

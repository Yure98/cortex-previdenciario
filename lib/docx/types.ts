import type { GenerationCase, PipelineResult } from "@/lib/engine/schemas";

export interface OfficeDocumentConfig {
  id: string;
  nome: string;
  oab: string | null;
  cidade: string | null;
  timbradoPath: string | null;
  corPrimaria: string;
  corSecundaria: string;
  corAcento: string;
}

export interface DocxGenerationInput {
  caso: GenerationCase;
  resultado: PipelineResult;
  escritorio: OfficeDocumentConfig;
  geracaoId: string;
  generatedAt?: Date;
}

export interface DocxPreflightReport {
  normalizedEntryNames: number;
  normalizedMeasurements: number;
  markerParagraphs: number;
  entryCount: number;
  uncompressedBytes: number;
  warnings: string[];
}

export interface GeneratedDocx {
  buffer: Buffer;
  fileName: string;
  storagePath: string;
  sha256: string;
  usedTemplate: boolean;
  preflight: DocxPreflightReport | null;
}

export interface DeliveryAccess {
  id: string;
  arquivoPath: string;
  arquivoNome: string;
  signedUrl: string;
  expiresAt: string;
}

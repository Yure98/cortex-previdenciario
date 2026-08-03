import { z } from "zod";

export const allowedBenefits = [
  "incapacidade",
  "bpc",
  "rural",
  "familia",
  "aposentadoria",
] as const;

export const allowedRagKeywords = [
  "incapacidade temporaria",
  "alta indevida",
  "incapacidade permanente",
  "conversao de beneficio",
  "pericia",
  "carencia",
  "qualidade de segurado",
  "deficiencia",
  "idoso",
  "rural",
  "segurado especial",
  "salario maternidade",
  "sequela",
  "acidente",
  "reducao da capacidade",
  "tempo especial",
  "agentes nocivos",
  "ruido",
  "pcd",
  "avaliacao biopsicossocial",
] as const;

const deidentifiedRagInputSchema = z.object({
  beneficio: z.enum(allowedBenefits),
  palavrasChave: z.array(z.enum(allowedRagKeywords)).min(1).max(8),
});

export type DeidentifiedRagInput = z.infer<typeof deidentifiedRagInputSchema>;

/**
 * Único contrato autorizado para gerar embeddings de casos.
 *
 * Não recebe fatos, documentos, nomes ou identificadores. A lista fechada impede
 * que texto livre com dados pessoais seja encaminhado ao provedor de embeddings.
 */
export function createDeidentifiedRagQuery(input: DeidentifiedRagInput): string {
  const parsed = deidentifiedRagInputSchema.parse(input);
  const uniqueKeywords = Array.from(new Set(parsed.palavrasChave)).sort();
  return `beneficio: ${parsed.beneficio}; palavras-chave: ${uniqueKeywords.join(", ")}`;
}

import { createHash } from "node:crypto";

import { createContentDocument } from "@/lib/docx/content";
import { createDeliveryFileName, createDeliveryStoragePath } from "@/lib/docx/filename";
import { validateGeneratedDocx } from "@/lib/docx/preflight";
import { applyContentToTemplate } from "@/lib/docx/template";
import type { DocxGenerationInput, GeneratedDocx } from "@/lib/docx/types";

export async function generateDeliveryDocx(
  input: DocxGenerationInput,
  templateBuffer: Buffer | null,
): Promise<GeneratedDocx> {
  const generatedAt = input.generatedAt ?? new Date();
  const fileName = createDeliveryFileName(input.caso.cliente_final, generatedAt);
  const storagePath = createDeliveryStoragePath({
    escritorioId: input.escritorio.id,
    casoId: input.caso.id,
    geracaoId: input.geracaoId,
    fileName,
  });

  const content = await createContentDocument(input, templateBuffer === null);
  const result = templateBuffer
    ? await applyContentToTemplate(templateBuffer, content)
    : { buffer: content, preflight: null };
  await validateGeneratedDocx(result.buffer);

  return {
    buffer: result.buffer,
    fileName,
    storagePath,
    sha256: createHash("sha256").update(result.buffer).digest("hex"),
    usedTemplate: templateBuffer !== null,
    preflight: result.preflight,
  };
}

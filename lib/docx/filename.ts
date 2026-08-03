const MAX_CLIENT_SLUG_LENGTH = 72;

export function sanitizeFileSegment(value: string): string {
  const sanitized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_CLIENT_SLUG_LENGTH)
    .replace(/_+$/g, "");

  return sanitized || "cliente";
}

export function createDeliveryFileName(clientName: string, date = new Date()): string {
  const isoDate = date.toISOString().slice(0, 10);
  return `peticao_${sanitizeFileSegment(clientName)}_${isoDate}.docx`;
}

export function createDeliveryStoragePath(input: {
  escritorioId: string;
  casoId: string;
  geracaoId: string;
  fileName: string;
}): string {
  return `${input.escritorioId}/${input.casoId}/${input.geracaoId}/${input.fileName}`;
}

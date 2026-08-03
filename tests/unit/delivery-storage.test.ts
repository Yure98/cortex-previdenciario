import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { EngineRepository } from "@/lib/engine/repository";
import type { GeneratedDocx } from "@/lib/docx/types";

describe("entrega DOCX privada", () => {
  it("envia ao bucket entregas e registra metadados pela RPC transacional", async () => {
    const upload = vi.fn().mockResolvedValue({ data: { path: "arquivo.docx" }, error: null });
    const fromStorage = vi.fn().mockReturnValue({ upload });
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: "00000000-0000-4000-8000-000000000099", error: null });
    const repository = new EngineRepository({ storage: { from: fromStorage }, rpc } as unknown as SupabaseClient);
    const delivery: GeneratedDocx = {
      buffer: Buffer.from("docx"),
      fileName: "peticao_maria_silva_2026-08-03.docx",
      storagePath:
        "00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/00000000-0000-4000-8000-000000000003/peticao_maria_silva_2026-08-03.docx",
      sha256: "a".repeat(64),
      usedTemplate: true,
      preflight: {
        warnings: [],
        normalizedEntryNames: 0,
        normalizedMeasurements: 0,
        markerParagraphs: 1,
        entryCount: 12,
        uncompressedBytes: 1_024,
      },
    };

    await expect(
      repository.publishDelivery("00000000-0000-4000-8000-000000000003", delivery, {
        usd: 0.25,
        brl: 1.42,
      }),
    ).resolves.toBe("00000000-0000-4000-8000-000000000099");

    expect(fromStorage).toHaveBeenCalledWith("entregas");
    expect(upload).toHaveBeenCalledWith(
      delivery.storagePath,
      delivery.buffer,
      expect.objectContaining({
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        cacheControl: "private, max-age=0, no-store",
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "registrar_entrega_concluir_geracao",
      expect.objectContaining({
        p_geracao_id: "00000000-0000-4000-8000-000000000003",
        p_arquivo_path: delivery.storagePath,
        p_nome_arquivo: delivery.fileName,
        p_sha256: delivery.sha256,
      }),
    );
  });

  it("gera URL assinada temporária sem persistir URL pública", async () => {
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed-token" },
      error: null,
    });
    const fromStorage = vi.fn().mockReturnValue({ createSignedUrl });
    const repository = new EngineRepository({
      storage: { from: fromStorage },
    } as unknown as SupabaseClient);
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-08-03T12:00:00.000Z"));

    await expect(repository.createSignedDeliveryUrl("office/case/file.docx", 300)).resolves.toEqual({
      signedUrl: "https://storage.example/signed-token",
      expiresAt: "2026-08-03T12:05:00.000Z",
    });
    expect(fromStorage).toHaveBeenCalledWith("entregas");
    expect(createSignedUrl).toHaveBeenCalledWith("office/case/file.docx", 300, {
      download: true,
    });
    now.mockRestore();
  });
});

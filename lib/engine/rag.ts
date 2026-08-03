import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { EngineError } from "@/lib/engine/errors";
import {
  thesisSchema,
  type Classification,
  type RetrievedThesis,
} from "@/lib/engine/schemas";
import { DeidentifiedVoyageClient } from "@/lib/engine/voyage";

export class ThesisRagService {
  constructor(
    private readonly admin: SupabaseClient,
    private readonly voyage: DeidentifiedVoyageClient,
    private readonly escritorioId: string,
    private readonly casoId: string,
  ) {}

  async retrieve(classification: Classification): Promise<RetrievedThesis[]> {
    const embedding = await this.voyage.embedCaseQuery({
      beneficio: classification.beneficio_rag,
      palavrasChave: classification.palavras_chave_rag,
    });

    const { data, error } = await this.admin.rpc("match_teses", {
      query_embedding: embedding,
      p_beneficio: classification.beneficio_rag,
      p_match_count: 3,
    });

    if (error) {
      throw new EngineError("ERRO_INTERNO", "A busca de teses falhou.", { cause: error });
    }

    const theses = thesisSchema.array().max(3).parse(data ?? []);
    if (theses.length === 0) {
      throw new EngineError(
        "RAG_SEM_TESES_ATIVAS",
        "Não há tese ativa e vetorizada para esta categoria. A curadoria precisa ativar ao menos uma.",
      );
    }

    await this.persistLinks(theses, classification);
    return theses;
  }

  private async persistLinks(
    theses: RetrievedThesis[],
    classification: Classification,
  ): Promise<void> {
    const { error: deleteError } = await this.admin
      .from("caso_teses")
      .delete()
      .eq("caso_id", this.casoId)
      .eq("escritorio_id", this.escritorioId);

    if (deleteError) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível atualizar as teses do caso.", {
        cause: deleteError,
      });
    }

    const { error: insertError } = await this.admin.from("caso_teses").insert(
      theses.map((thesis, index) => ({
        escritorio_id: this.escritorioId,
        caso_id: this.casoId,
        tese_id: thesis.id,
        ordem: index + 1,
        similaridade: thesis.similaridade,
        motivo: `${classification.beneficio_rag}: ${classification.palavras_chave_rag.join(", ")}`,
      })),
    );

    if (insertError) {
      throw new EngineError("ERRO_INTERNO", "Não foi possível vincular as teses ao caso.", {
        cause: insertError,
      });
    }
  }
}

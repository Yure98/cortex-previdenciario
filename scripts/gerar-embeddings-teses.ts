import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const environmentSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE: z.string().min(1),
  VOYAGE_API_KEY: z.string().min(1),
  MODELO_EMBEDDING: z.literal("voyage-4"),
});

const thesisSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  titulo: z.string(),
  beneficio: z.string().nullable(),
  categoria: z.string().nullable(),
  resumo: z.string().nullable(),
  requisitos: z.array(z.unknown()),
  base_legal: z.array(z.unknown()),
  provas_necessarias: z.array(z.unknown()),
  tags: z.array(z.string()),
});

const voyageResponseSchema = z.object({
  data: z.array(
    z.object({
      embedding: z.array(z.number()).length(1024),
      index: z.number().int(),
    }),
  ),
  usage: z.object({ total_tokens: z.number().int().nonnegative() }),
});

function thesisDocument(thesis: z.infer<typeof thesisSchema>): string {
  return JSON.stringify({
    titulo: thesis.titulo,
    beneficio: thesis.beneficio,
    categoria: thesis.categoria,
    resumo: thesis.resumo,
    requisitos: thesis.requisitos,
    base_legal: thesis.base_legal,
    provas_necessarias: thesis.provas_necessarias,
    tags: thesis.tags,
  });
}

async function main(): Promise<void> {
  const environment = environmentSchema.parse(process.env);
  const force = process.argv.includes("--force");
  const supabase = createClient(environment.SUPABASE_URL, environment.SUPABASE_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = supabase
    .from("teses")
    .select(
      "id,slug,titulo,beneficio,categoria,resumo,requisitos,base_legal,provas_necessarias,tags",
    )
    .neq("status", "arquivada")
    .order("slug");
  if (!force) query = query.is("embedding", null);

  const { data, error } = await query;
  if (error) throw error;
  const theses = thesisSchema.array().parse(data ?? []);

  let totalTokens = 0;
  for (let offset = 0; offset < theses.length; offset += 16) {
    const batch = theses.slice(offset, offset + 16);
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${environment.VOYAGE_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: batch.map(thesisDocument),
        model: environment.MODELO_EMBEDDING,
        input_type: "document",
        output_dimension: 1024,
        output_dtype: "float",
        truncation: false,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`VOYAGE_HTTP_${response.status}`);

    const embedded = voyageResponseSchema.parse(await response.json());
    totalTokens += embedded.usage.total_tokens;

    for (const item of embedded.data) {
      const thesis = batch[item.index];
      if (!thesis) throw new Error("VOYAGE_INDICE_INVALIDO");
      const { error: updateError } = await supabase
        .from("teses")
        .update({ embedding: item.embedding, embedding_model: environment.MODELO_EMBEDDING })
        .eq("id", thesis.id);
      if (updateError) throw updateError;
    }
  }

  process.stdout.write(
    `${JSON.stringify({ teses_atualizadas: theses.length, tokens_voyage: totalTokens })}\n`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "ERRO_DESCONHECIDO";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

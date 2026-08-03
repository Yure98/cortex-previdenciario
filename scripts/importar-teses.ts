import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const thesisSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    titulo: z.string().min(3),
    beneficio: z.string().min(2).nullable().optional(),
    categoria: z.string().nullable().optional(),
    resumo: z.string().nullable().optional(),
    requisitos: z.array(z.string()).default([]),
    base_legal: z.array(z.string()).default([]),
    jurisprudencia_chave: z.array(z.string()).default([]),
    provas_necessarias: z.array(z.string()).default([]),
    estrategia: z.string().nullable().optional(),
    modelo_redacao: z.string().nullable().optional(),
    erros_comuns: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    versao: z.number().int().positive().default(1),
    data_corte: z.string().date().nullable().optional(),
    metadata: z.record(z.unknown()).default({}),
  })
  .strict();

const payloadSchema = z.array(thesisSchema).min(1);

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Uso: npm run teses:importar -- caminho/teses.json");
  }

  const url = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !serviceRole) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE são obrigatórios.");
  }

  const raw = await readFile(resolve(inputPath), "utf8");
  const theses = payloadSchema.parse(JSON.parse(raw)).map((thesis) => ({
    ...thesis,
    status: "rascunho" as const,
    embedding: null,
    embedding_model: null,
    metadata: {
      ...thesis.metadata,
      importado_em: new Date().toISOString(),
      curadoria: "pendente",
    },
  }));

  const supabase = createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await supabase.from("teses").upsert(theses, { onConflict: "slug" });

  if (error) {
    throw error;
  }

  process.stdout.write(`${theses.length} tese(s) importada(s) como rascunho.\n`);
}

void main();

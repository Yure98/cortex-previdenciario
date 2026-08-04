import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
const migrationFiles = readdirSync(migrationsDirectory).sort();
const sql = migrationFiles
  .map((file) => readFileSync(join(migrationsDirectory, file), "utf8"))
  .join("\n");

const rlsTables = [
  "escritorios",
  "usuarios",
  "modelos_escritorio",
  "casos",
  "documentos",
  "entregas",
  "auditoria",
  "feedback",
  "teses",
  "jurisprudencia",
  "caso_teses",
  "assinaturas",
  "faturas",
  "uso_tokens",
  "geracoes",
  "consumos_peca",
  "creditos_peca",
  "webhook_eventos",
  "rate_limit_buckets",
];

describe("contrato das migrations", () => {
  it("mantém migrations em ordem determinística", () => {
    expect(migrationFiles).toEqual([
      "0001_extensions_and_enums.sql",
      "0002_tenancy_and_auth.sql",
      "0003_cases_and_documents.sql",
      "0004_legal_knowledge.sql",
      "0005_billing_and_usage.sql",
      "0006_functions_and_indexes.sql",
      "0007_rls_policies.sql",
      "0008_private_storage.sql",
      "0009_realtime.sql",
      "0010_seed_teses_tier1.sql",
      "0011_phase2_engine.sql",
      "0012_phase3_docx_delivery.sql",
      "0013_phase5_admin_qa.sql",
      "0014_phase6_billing.sql",
      "0015_phase7_observability_rate_limits.sql",
    ]);
  });

  it.each(rlsTables)("ativa RLS em %s", (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
  });

  it("usa embeddings Voyage com 1.024 dimensões e limita o RAG a três teses", () => {
    expect(sql).toContain("embedding extensions.vector(1024)");
    expect(sql).toContain("limit least(greatest(p_match_count, 1), 3)");
    expect(sql).toContain("ordem between 1 and 3");
  });

  it("registra os contadores de prompt caching e reserva custo antes da chamada", () => {
    expect(sql).toContain("cache_read_input_tokens bigint");
    expect(sql).toContain("cache_creation_input_tokens bigint");
    expect(sql).toContain("create or replace function public.reservar_uso_tokens");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("configura os valores comerciais aprovados", () => {
    expect(sql).toContain("valor_setup_centavos integer not null default 60000");
    expect(sql).toContain("dias_ate_primeira_mensalidade integer not null default 30");
    expect(sql).toContain("franquia_pecas_mensal integer not null default 25");
    expect(sql).toContain("valor_excedente_centavos integer not null default 2900");
    expect(sql).toContain("valor_centavos integer not null default 39700");
  });

  it("bloqueia inadimplência e excedente não pago de forma transacional", () => {
    expect(sql).toContain("create or replace function public.autorizar_geracao_caso");
    expect(sql).toContain("raise exception 'INADIMPLENTE'");
    expect(sql).toContain("raise exception 'EXCEDENTE_NAO_PAGO'");
    expect(sql).toContain("'cortex:billing:'");
  });

  it("cria exatamente onze entradas Tier 1 como rascunho", () => {
    const seed = readFileSync(
      join(migrationsDirectory, "0010_seed_teses_tier1.sql"),
      "utf8",
    );
    expect(seed.match(/\{"tier": 1, "curadoria": "pendente"/g)).toHaveLength(11);
    expect(seed).not.toContain("'ativa',\n+    '{\"tier\": 1");
  });

  it("não concede acesso direto de cliente ao bucket de entregas", () => {
    const storageMigration = readFileSync(
      join(migrationsDirectory, "0008_private_storage.sql"),
      "utf8",
    );
    expect(storageMigration).not.toMatch(
      /create policy[\s\S]*?on storage\.objects[\s\S]*?bucket_id = 'entregas'/,
    );
  });

  it("registra entrega DOCX e conclui a geração na mesma transação", () => {
    expect(sql).toContain("create or replace function public.registrar_entrega_concluir_geracao");
    expect(sql).toContain("entregas_geracao_unica_idx");
    expect(sql).toContain("'entrega_docx_gerada'");
    expect(sql).toContain("p_sha256 !~ '^[0-9a-f]{64}$'");
  });

  it("protege QA administrativo por papel",()=>{expect(sql).toContain("public.admin_revisar_entrega");expect(sql).toContain("public.admin_atualizar_status_caso");expect(sql.match(/if not public\.is_platform_admin\(\) then/g)).toHaveLength(2);expect(sql).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}/i);});

  it("mantém cobrança idempotente, em centavos e sem escrita pelo navegador", () => {
    expect(sql).toContain("asaas_event_id text not null unique");
    expect(sql).toContain("p_valor_centavos integer");
    expect(sql).toContain("create or replace function public.processar_evento_asaas");
    expect(sql).toContain("on conflict (asaas_event_id) do nothing");
    expect(sql).toContain("revoke all on public.creditos_peca from public, anon, authenticated");
    expect(sql).toContain("grant select on public.creditos_peca to authenticated");
  });

  it("mantém rate limiting atômico e invisível ao navegador", () => {
    expect(sql).toContain("create table public.rate_limit_buckets");
    expect(sql).toContain("create or replace function public.consumir_rate_limit");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("chave_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("revoke all on public.rate_limit_buckets from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.consumir_rate_limit(text, text, integer, integer)");
  });
});

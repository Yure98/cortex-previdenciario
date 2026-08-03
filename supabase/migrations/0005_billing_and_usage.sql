set lock_timeout = '5s';
set statement_timeout = '120s';

create table public.assinaturas (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  plano text not null default 'cortex_mensal',
  valor_centavos integer not null default 39700 check (valor_centavos >= 0),
  ciclo text not null default 'mensal' check (ciclo = 'mensal'),
  status public.assinatura_status not null default 'pendente',
  asaas_id text unique,
  inicio_cobranca date,
  proximo_vencimento date,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  cancelado_em timestamptz,
  unique (id, escritorio_id)
);

create unique index assinaturas_uma_aberta_por_escritorio_idx
  on public.assinaturas(escritorio_id)
  where status in ('pendente', 'ativa', 'inadimplente');

create table public.faturas (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  assinatura_id uuid,
  valor_centavos integer not null check (valor_centavos >= 0),
  tipo public.fatura_tipo not null,
  status public.fatura_status not null default 'pendente',
  asaas_id text unique,
  competencia date,
  vencimento date,
  quantidade_pecas integer check (quantidade_pecas is null or quantidade_pecas > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  pago_em timestamptz,
  unique (id, escritorio_id),
  foreign key (assinatura_id, escritorio_id)
    references public.assinaturas(id, escritorio_id) on delete set null (assinatura_id)
);

alter table public.casos
  add column competencia_franquia date,
  add column contabiliza_franquia boolean not null default true,
  add column fatura_excedente_id uuid,
  add foreign key (fatura_excedente_id, escritorio_id)
    references public.faturas(id, escritorio_id) on delete set null (fatura_excedente_id);

create table public.uso_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  caso_id uuid not null,
  request_id uuid not null,
  provedor text not null default 'anthropic' check (provedor in ('anthropic', 'voyage')),
  etapa text not null,
  modelo text not null,
  status public.uso_status not null default 'reservada',
  tokens_reservados bigint not null default 0 check (tokens_reservados >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cache_read_input_tokens bigint not null default 0 check (cache_read_input_tokens >= 0),
  cache_creation_input_tokens bigint not null default 0 check (cache_creation_input_tokens >= 0),
  custo_reservado_usd numeric(18, 10) not null default 0 check (custo_reservado_usd >= 0),
  custo_usd numeric(18, 10) not null default 0 check (custo_usd >= 0),
  custo_brl numeric(18, 8) not null default 0 check (custo_brl >= 0),
  cotacao_usd_brl numeric(12, 6) check (cotacao_usd_brl is null or cotacao_usd_brl > 0),
  erro_codigo text,
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  foreign key (caso_id, escritorio_id)
    references public.casos(id, escritorio_id) on delete cascade
);

create index assinaturas_escritorio_status_idx on public.assinaturas(escritorio_id, status);
create index faturas_escritorio_status_idx on public.faturas(escritorio_id, status, vencimento);
create index uso_tokens_escritorio_criado_idx on public.uso_tokens(escritorio_id, criado_em desc);
create index uso_tokens_caso_idx on public.uso_tokens(caso_id, criado_em);
create index uso_tokens_request_idx on public.uso_tokens(request_id);

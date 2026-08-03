set lock_timeout = '5s';
set statement_timeout = '120s';

create table public.teses (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  titulo text not null,
  beneficio text,
  categoria text,
  resumo text,
  requisitos jsonb not null default '[]'::jsonb check (jsonb_typeof(requisitos) = 'array'),
  base_legal jsonb not null default '[]'::jsonb check (jsonb_typeof(base_legal) = 'array'),
  jurisprudencia_chave jsonb not null default '[]'::jsonb check (
    jsonb_typeof(jurisprudencia_chave) = 'array'
  ),
  provas_necessarias jsonb not null default '[]'::jsonb check (
    jsonb_typeof(provas_necessarias) = 'array'
  ),
  estrategia text,
  modelo_redacao text,
  erros_comuns jsonb not null default '[]'::jsonb check (jsonb_typeof(erros_comuns) = 'array'),
  tags text[] not null default '{}',
  embedding extensions.vector(1024),
  embedding_model text,
  status public.tese_status not null default 'rascunho',
  versao integer not null default 1 check (versao > 0),
  data_corte date,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint teses_embedding_model_consistente check (
    (embedding is null and embedding_model is null)
    or (embedding is not null and embedding_model is not null)
  )
);

create table public.jurisprudencia (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid references public.escritorios(id) on delete cascade,
  tese_id uuid references public.teses(id) on delete set null,
  tribunal text,
  identificador text,
  ementa text not null,
  url text check (url is null or url ~ '^https://'),
  data_julgamento date,
  marcador_conferir boolean not null default true,
  fonte_publica boolean not null default true,
  status public.tese_status not null default 'rascunho',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint jurisprudencia_escopo_consistente check (
    (fonte_publica and escritorio_id is null)
    or (not fonte_publica and escritorio_id is not null)
  )
);

create table public.caso_teses (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  caso_id uuid not null,
  tese_id uuid not null references public.teses(id) on delete restrict,
  ordem smallint not null check (ordem between 1 and 3),
  similaridade double precision check (similaridade is null or similaridade between -1 and 1),
  motivo text,
  criado_em timestamptz not null default now(),
  unique (caso_id, tese_id),
  unique (caso_id, ordem),
  foreign key (caso_id, escritorio_id)
    references public.casos(id, escritorio_id) on delete cascade
);

create or replace function public.match_teses(
  query_embedding extensions.vector(1024),
  p_beneficio text default null,
  p_match_count integer default 3
)
returns table (
  id uuid,
  slug text,
  titulo text,
  beneficio text,
  resumo text,
  requisitos jsonb,
  base_legal jsonb,
  jurisprudencia_chave jsonb,
  provas_necessarias jsonb,
  modelo_redacao text,
  erros_comuns jsonb,
  similaridade double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    t.id,
    t.slug,
    t.titulo,
    t.beneficio,
    t.resumo,
    t.requisitos,
    t.base_legal,
    t.jurisprudencia_chave,
    t.provas_necessarias,
    t.modelo_redacao,
    t.erros_comuns,
    1 - (t.embedding <=> query_embedding) as similaridade
  from public.teses t
  where t.status = 'ativa'::public.tese_status
    and t.embedding is not null
    and (p_beneficio is null or t.beneficio = p_beneficio)
  order by t.embedding <=> query_embedding
  limit least(greatest(p_match_count, 1), 3);
$$;

revoke all on function public.match_teses(extensions.vector, text, integer) from public;
grant execute on function public.match_teses(extensions.vector, text, integer)
  to authenticated, service_role;

create index teses_embedding_hnsw_idx
  on public.teses using hnsw (embedding vector_cosine_ops)
  where embedding is not null;
create index teses_tags_gin_idx on public.teses using gin(tags);
create index teses_beneficio_status_idx on public.teses(beneficio, status);
create index jurisprudencia_tese_idx on public.jurisprudencia(tese_id);
create index jurisprudencia_escritorio_idx on public.jurisprudencia(escritorio_id);
create index caso_teses_caso_ordem_idx on public.caso_teses(caso_id, ordem);

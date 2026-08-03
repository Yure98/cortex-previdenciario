set lock_timeout = '5s';
set statement_timeout = '120s';

create table public.casos (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  cliente_final text not null check (char_length(btrim(cliente_final)) between 2 and 200),
  beneficio text not null check (char_length(btrim(beneficio)) between 2 and 120),
  tipo_peca text not null check (char_length(btrim(tipo_peca)) between 2 and 120),
  formato public.caso_formato not null default 'tradicional',
  pesquisou_juris boolean not null default false,
  status public.caso_status not null default 'recebido',
  prioridade smallint not null default 0 check (prioridade between 0 and 5),
  fatos text,
  pedidos jsonb not null default '[]'::jsonb check (jsonb_typeof(pedidos) = 'array'),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object'),
  rag_resumo_deidentificado text check (
    rag_resumo_deidentificado is null or char_length(rag_resumo_deidentificado) <= 1000
  ),
  rag_guardrail_versao text not null default 'beneficio-keywords-v1',
  sla_ate timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  entregue_em timestamptz,
  unique (id, escritorio_id)
);

create table public.documentos (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  caso_id uuid not null,
  tipo public.documento_tipo not null,
  arquivo_path text not null,
  nome_original text,
  mime_type text,
  tamanho_bytes bigint check (tamanho_bytes is null or tamanho_bytes >= 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  versao integer not null default 1 check (versao > 0),
  criado_por uuid,
  criado_em timestamptz not null default now(),
  unique (id, escritorio_id),
  unique (caso_id, tipo, versao),
  foreign key (caso_id, escritorio_id)
    references public.casos(id, escritorio_id) on delete cascade,
  foreign key (criado_por, escritorio_id)
    references public.usuarios(id, escritorio_id) on delete set null (criado_por),
  constraint documentos_arquivo_path_proprio check (
    split_part(arquivo_path, '/', 1) = escritorio_id::text
  )
);

create table public.entregas (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  caso_id uuid not null,
  arquivo_path text not null,
  versao integer not null default 1 check (versao > 0),
  revisado_por uuid,
  qa_status public.qa_status not null default 'pendente',
  qa_checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(qa_checklist) = 'object'),
  qa_observacoes text,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz,
  unique (id, escritorio_id),
  unique (caso_id, versao),
  foreign key (caso_id, escritorio_id)
    references public.casos(id, escritorio_id) on delete cascade,
  foreign key (revisado_por, escritorio_id)
    references public.usuarios(id, escritorio_id) on delete set null (revisado_por),
  constraint entregas_arquivo_path_proprio check (
    split_part(arquivo_path, '/', 1) = escritorio_id::text
  )
);

create table public.auditoria (
  id bigint generated always as identity primary key,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  caso_id uuid,
  evento text not null,
  autor_usuario_id uuid,
  autor text not null default 'sistema',
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  evento_externo_id text unique,
  criado_em timestamptz not null default now(),
  foreign key (caso_id, escritorio_id)
    references public.casos(id, escritorio_id) on delete cascade,
  foreign key (autor_usuario_id, escritorio_id)
    references public.usuarios(id, escritorio_id) on delete set null (autor_usuario_id)
);

create table public.feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  caso_id uuid not null,
  usuario_id uuid not null,
  nota smallint not null check (nota between 0 and 10),
  comentario text,
  criado_em timestamptz not null default now(),
  unique (caso_id, usuario_id),
  foreign key (caso_id, escritorio_id)
    references public.casos(id, escritorio_id) on delete cascade,
  foreign key (usuario_id, escritorio_id)
    references public.usuarios(id, escritorio_id) on delete cascade
);

create index casos_escritorio_status_criado_idx
  on public.casos(escritorio_id, status, criado_em desc);
create index casos_sla_idx on public.casos(sla_ate) where status <> 'entregue';
create index documentos_caso_idx on public.documentos(caso_id, criado_em desc);
create index entregas_caso_idx on public.entregas(caso_id, versao desc);
create index auditoria_caso_idx on public.auditoria(caso_id, criado_em desc);

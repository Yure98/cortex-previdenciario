set lock_timeout = '5s';
set statement_timeout = '120s';

create table public.escritorios (
  id uuid primary key default extensions.gen_random_uuid(),
  nome text not null check (char_length(btrim(nome)) between 2 and 160),
  oab text,
  cidade text,
  plano text not null default 'cortex_mensal',
  status public.escritorio_status not null default 'onboarding',
  timbrado_path text,
  cor_primaria text not null default '#111111' check (cor_primaria ~ '^#[0-9A-Fa-f]{6}$'),
  cor_secundaria text not null default '#f5f5f5' check (cor_secundaria ~ '^#[0-9A-Fa-f]{6}$'),
  cor_acento text not null default '#3b82f6' check (cor_acento ~ '^#[0-9A-Fa-f]{6}$'),
  notebooklm_url text check (notebooklm_url is null or notebooklm_url ~ '^https://'),
  teto_token_mensal bigint check (teto_token_mensal is null or teto_token_mensal > 0),
  teto_gasto_mensal_usd numeric(14, 6) check (
    teto_gasto_mensal_usd is null or teto_gasto_mensal_usd > 0
  ),
  franquia_pecas_mensal integer not null default 25 check (franquia_pecas_mensal > 0),
  valor_excedente_centavos integer not null default 2900 check (valor_excedente_centavos >= 0),
  data_onboarding timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint escritorios_timbrado_path_proprio check (
    timbrado_path is null or split_part(timbrado_path, '/', 1) = id::text
  )
);

create table public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text,
  papel public.usuario_papel not null default 'proprietario',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, escritorio_id)
);

create table public.modelos_escritorio (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 160),
  arquivo_path text not null,
  tipo text not null default 'peticao',
  ativo boolean not null default true,
  enviado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, escritorio_id),
  foreign key (enviado_por, escritorio_id)
    references public.usuarios(id, escritorio_id) on delete set null (enviado_por),
  constraint modelos_arquivo_path_proprio check (
    split_part(arquivo_path, '/', 1) = escritorio_id::text
  )
);

create or replace function public.current_escritorio_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.escritorio_id
  from public.usuarios u
  where u.id = (select auth.uid())
  limit 1;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select u.papel = 'platform_admin'::public.usuario_papel
      from public.usuarios u
      where u.id = (select auth.uid())
      limit 1
    ),
    false
  );
$$;

revoke all on function public.current_escritorio_id() from public;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.current_escritorio_id() to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  novo_escritorio_id uuid;
  nome_escritorio text;
begin
  nome_escritorio := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'escritorio_nome'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Escritorio em configuracao'
  );

  insert into public.escritorios (nome)
  values (nome_escritorio)
  returning id into novo_escritorio_id;

  insert into public.usuarios (id, escritorio_id, nome, papel)
  values (
    new.id,
    novo_escritorio_id,
    nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
    'proprietario'::public.usuario_papel
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create index usuarios_escritorio_id_idx on public.usuarios(escritorio_id);
create index modelos_escritorio_id_idx on public.modelos_escritorio(escritorio_id);

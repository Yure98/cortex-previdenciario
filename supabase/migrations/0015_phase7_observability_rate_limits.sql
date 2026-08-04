set lock_timeout = '5s';
set statement_timeout = '120s';

-- Chaves são HMAC-SHA256 calculados no servidor. IP e e-mail nunca entram no banco.
create table public.rate_limit_buckets (
  escopo text not null check (char_length(escopo) between 1 and 80),
  chave_hash text not null check (chave_hash ~ '^[0-9a-f]{64}$'),
  janela_inicio timestamptz not null,
  contador integer not null check (contador > 0),
  atualizado_em timestamptz not null default now(),
  primary key (escopo, chave_hash)
);

alter table public.rate_limit_buckets enable row level security;
revoke all on public.rate_limit_buckets from public, anon, authenticated;
grant all on public.rate_limit_buckets to service_role;

create or replace function public.consumir_rate_limit(
  p_escopo text,
  p_chave_hash text,
  p_limite integer,
  p_janela_segundos integer
)
returns table (permitido boolean, restantes integer, tentar_novamente_em integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_agora timestamptz := clock_timestamp();
  v_bucket public.rate_limit_buckets%rowtype;
  v_decorrido integer;
begin
  if p_escopo is null or char_length(p_escopo) not between 1 and 80
    or p_chave_hash !~ '^[0-9a-f]{64}$'
    or p_limite not between 1 and 10000
    or p_janela_segundos not between 1 and 86400 then
    raise exception 'RATE_LIMIT_INVALIDO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cortex:rate:' || p_escopo || ':' || p_chave_hash, 0)
  );

  select * into v_bucket
  from public.rate_limit_buckets
  where escopo = p_escopo and chave_hash = p_chave_hash
  for update;

  if not found or v_bucket.janela_inicio + pg_catalog.make_interval(secs => p_janela_segundos) <= v_agora then
    insert into public.rate_limit_buckets (escopo, chave_hash, janela_inicio, contador, atualizado_em)
    values (p_escopo, p_chave_hash, v_agora, 1, v_agora)
    on conflict (escopo, chave_hash) do update
      set janela_inicio = excluded.janela_inicio,
          contador = 1,
          atualizado_em = excluded.atualizado_em;
    return query select true, greatest(p_limite - 1, 0), 0;
    return;
  end if;

  update public.rate_limit_buckets
  set contador = contador + 1, atualizado_em = v_agora
  where escopo = p_escopo and chave_hash = p_chave_hash
  returning * into v_bucket;

  v_decorrido := floor(extract(epoch from (v_agora - v_bucket.janela_inicio)))::integer;
  return query select
    v_bucket.contador <= p_limite,
    greatest(p_limite - v_bucket.contador, 0),
    case when v_bucket.contador > p_limite
      then greatest(p_janela_segundos - v_decorrido, 1)
      else 0
    end;
end;
$$;

revoke all on function public.consumir_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consumir_rate_limit(text, text, integer, integer)
  to service_role;

create or replace function public.gasto_global_mes_usd()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(custo_usd), 0)::numeric
  from public.uso_tokens
  where status in ('reservada', 'concluida')
    and criado_em >= date_trunc('month', now() at time zone 'UTC');
$$;

revoke all on function public.gasto_global_mes_usd() from public, anon, authenticated;
grant execute on function public.gasto_global_mes_usd() to service_role;

set lock_timeout = '5s';
set statement_timeout = '120s';

create type public.geracao_status as enum (
  'iniciada',
  'processando',
  'concluida',
  'falhou'
);

create type public.consumo_peca_status as enum ('reservado', 'concluido', 'cancelado');
create type public.consumo_peca_tipo as enum ('franquia', 'excedente');

create table public.geracoes (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  caso_id uuid not null,
  request_id uuid not null,
  tipo_operacao text not null check (tipo_operacao in ('peticao', 'cnis')),
  status public.geracao_status not null default 'iniciada',
  etapa_atual text not null default 'precheck',
  diagnostico jsonb,
  classificacao jsonb,
  teses_aplicadas jsonb not null default '[]'::jsonb check (
    jsonb_typeof(teses_aplicadas) = 'array'
  ),
  analise jsonb,
  minuta jsonb,
  revisao jsonb,
  custo_usd numeric(18, 10) not null default 0 check (custo_usd >= 0),
  custo_brl numeric(18, 8) not null default 0 check (custo_brl >= 0),
  erro_codigo text,
  erro_detalhe text,
  iniciado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (id, escritorio_id),
  unique (request_id),
  foreign key (caso_id, escritorio_id)
    references public.casos(id, escritorio_id) on delete cascade,
  constraint geracoes_diagnostico_objeto check (
    diagnostico is null or jsonb_typeof(diagnostico) = 'object'
  ),
  constraint geracoes_classificacao_objeto check (
    classificacao is null or jsonb_typeof(classificacao) = 'object'
  ),
  constraint geracoes_analise_objeto check (
    analise is null or jsonb_typeof(analise) = 'object'
  ),
  constraint geracoes_minuta_objeto check (
    minuta is null or jsonb_typeof(minuta) = 'object'
  ),
  constraint geracoes_revisao_objeto check (
    revisao is null or jsonb_typeof(revisao) = 'object'
  )
);

create table public.consumos_peca (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  caso_id uuid not null,
  geracao_id uuid not null,
  competencia date not null,
  tipo public.consumo_peca_tipo not null,
  status public.consumo_peca_status not null default 'reservado',
  fatura_id uuid,
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  unique (geracao_id),
  foreign key (caso_id, escritorio_id)
    references public.casos(id, escritorio_id) on delete cascade,
  foreign key (geracao_id, escritorio_id)
    references public.geracoes(id, escritorio_id) on delete cascade,
  foreign key (fatura_id, escritorio_id)
    references public.faturas(id, escritorio_id) on delete restrict,
  constraint consumos_competencia_primeiro_dia check (
    competencia = date_trunc('month', competencia)::date
  ),
  constraint consumos_excedente_fatura check (
    (tipo = 'franquia'::public.consumo_peca_tipo and fatura_id is null)
    or (tipo = 'excedente'::public.consumo_peca_tipo and fatura_id is not null)
  )
);

alter table public.casos
  add constraint casos_fatos_tamanho check (
    fatos is null or char_length(fatos) <= 50000
  ),
  add constraint casos_inputs_tamanho check (
    octet_length(inputs::text) <= 100000
  );

create index geracoes_caso_criado_idx
  on public.geracoes(caso_id, criado_em desc);
create index geracoes_escritorio_status_idx
  on public.geracoes(escritorio_id, status, criado_em desc);
create index consumos_peca_competencia_idx
  on public.consumos_peca(escritorio_id, competencia, status);
create trigger geracoes_set_atualizado_em before update on public.geracoes
  for each row execute function public.set_atualizado_em();

create or replace function public.checar_teto_geracao(
  p_escritorio_id uuid,
  p_caso_id uuid,
  p_limite_global_usd numeric,
  p_limite_peca_usd numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio public.escritorios%rowtype;
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  v_gasto_global numeric := 0;
  v_gasto_escritorio numeric := 0;
  v_gasto_peca numeric := 0;
  v_tokens_escritorio bigint := 0;
begin
  if p_limite_global_usd <= 0 or p_limite_peca_usd <= 0 then
    raise exception 'LIMITE_INVALIDO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cortex:spend-cap:' || to_char(v_inicio_mes, 'YYYY-MM'), 0)
  );

  select * into v_escritorio
  from public.escritorios
  where id = p_escritorio_id;

  if not found then
    raise exception 'ESCRITORIO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.casos c
    where c.id = p_caso_id and c.escritorio_id = p_escritorio_id
  ) then
    raise exception 'CASO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  select coalesce(sum(
    case when status = 'reservada'::public.uso_status
      then custo_reservado_usd else custo_usd end
  ), 0)
  into v_gasto_global
  from public.uso_tokens
  where criado_em >= v_inicio_mes
    and status <> 'cancelada'::public.uso_status;

  select
    coalesce(sum(
      case when status = 'reservada'::public.uso_status
        then custo_reservado_usd else custo_usd end
    ), 0),
    coalesce(sum(
      case when status = 'reservada'::public.uso_status
        then tokens_reservados
        else input_tokens + output_tokens
          + cache_read_input_tokens + cache_creation_input_tokens
      end
    ), 0)
  into v_gasto_escritorio, v_tokens_escritorio
  from public.uso_tokens
  where escritorio_id = p_escritorio_id
    and criado_em >= v_inicio_mes
    and status <> 'cancelada'::public.uso_status;

  select coalesce(sum(
    case when status = 'reservada'::public.uso_status
      then custo_reservado_usd else custo_usd end
  ), 0)
  into v_gasto_peca
  from public.uso_tokens
  where caso_id = p_caso_id
    and status <> 'cancelada'::public.uso_status;

  if v_gasto_global >= p_limite_global_usd then
    raise exception 'TETO_ATINGIDO' using errcode = 'P0001', detail = 'GLOBAL';
  end if;

  if v_escritorio.teto_gasto_mensal_usd is not null
    and v_gasto_escritorio >= v_escritorio.teto_gasto_mensal_usd then
    raise exception 'TETO_ATINGIDO' using errcode = 'P0001', detail = 'ESCRITORIO_USD';
  end if;

  if v_escritorio.teto_token_mensal is not null
    and v_tokens_escritorio >= v_escritorio.teto_token_mensal then
    raise exception 'TETO_ATINGIDO' using errcode = 'P0001', detail = 'ESCRITORIO_TOKENS';
  end if;

  if v_gasto_peca >= p_limite_peca_usd then
    raise exception 'TETO_ATINGIDO' using errcode = 'P0001', detail = 'PECA';
  end if;
end;
$$;

create or replace function public.autorizar_geracao_caso(
  p_escritorio_id uuid,
  p_caso_id uuid,
  p_geracao_id uuid
)
returns public.consumo_peca_tipo
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escritorio public.escritorios%rowtype;
  v_competencia date := date_trunc('month', now() at time zone 'UTC')::date;
  v_consumidas integer := 0;
  v_excedentes_consumidos integer := 0;
  v_fatura_id uuid;
  v_tipo public.consumo_peca_tipo;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cortex:billing:' || p_escritorio_id::text || ':' || v_competencia::text,
      0
    )
  );

  select * into v_escritorio
  from public.escritorios
  where id = p_escritorio_id
  for update;

  if not found then
    raise exception 'ESCRITORIO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  if v_escritorio.status in (
    'suspenso'::public.escritorio_status,
    'inadimplente'::public.escritorio_status,
    'cancelado'::public.escritorio_status
  ) then
    raise exception 'INADIMPLENTE' using errcode = 'P0001', detail = v_escritorio.status::text;
  end if;

  if exists (
    select 1 from public.assinaturas a
    where a.escritorio_id = p_escritorio_id
      and a.status = 'inadimplente'::public.assinatura_status
  ) or exists (
    select 1 from public.faturas f
    where f.escritorio_id = p_escritorio_id
      and f.status = 'vencida'::public.fatura_status
  ) then
    raise exception 'INADIMPLENTE' using errcode = 'P0001', detail = 'COBRANCA';
  end if;

  if not exists (
    select 1 from public.casos c
    where c.id = p_caso_id and c.escritorio_id = p_escritorio_id
  ) then
    raise exception 'CASO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.geracoes g
    where g.id = p_geracao_id
      and g.caso_id = p_caso_id
      and g.escritorio_id = p_escritorio_id
  ) then
    raise exception 'GERACAO_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;

  select cp.tipo into v_tipo
  from public.consumos_peca cp
  where cp.geracao_id = p_geracao_id;

  if found then
    return v_tipo;
  end if;

  select count(*) into v_consumidas
  from public.consumos_peca cp
  where cp.escritorio_id = p_escritorio_id
    and cp.competencia = v_competencia
    and cp.status in (
      'reservado'::public.consumo_peca_status,
      'concluido'::public.consumo_peca_status
    );

  if v_consumidas < v_escritorio.franquia_pecas_mensal then
    v_tipo := 'franquia'::public.consumo_peca_tipo;
  else
    select count(*) into v_excedentes_consumidos
    from public.consumos_peca cp
    where cp.escritorio_id = p_escritorio_id
      and cp.competencia = v_competencia
      and cp.tipo = 'excedente'::public.consumo_peca_tipo
      and cp.status in (
        'reservado'::public.consumo_peca_status,
        'concluido'::public.consumo_peca_status
      );

    select f.id into v_fatura_id
    from public.faturas f
    where f.escritorio_id = p_escritorio_id
      and f.tipo = 'addon'::public.fatura_tipo
      and f.status = 'paga'::public.fatura_status
      and date_trunc('month', coalesce(f.competencia, f.pago_em::date, f.criado_em::date))::date
        = v_competencia
      and coalesce(f.quantidade_pecas, 1) > (
        select count(*)
        from public.consumos_peca usados
        where usados.fatura_id = f.id
          and usados.status in (
            'reservado'::public.consumo_peca_status,
            'concluido'::public.consumo_peca_status
          )
      )
    order by f.pago_em nulls last, f.criado_em
    limit 1;

    if v_fatura_id is null then
      raise exception 'EXCEDENTE_NAO_PAGO'
        using errcode = 'P0001', detail = v_excedentes_consumidos::text;
    end if;

    v_tipo := 'excedente'::public.consumo_peca_tipo;
  end if;

  insert into public.consumos_peca (
    escritorio_id,
    caso_id,
    geracao_id,
    competencia,
    tipo,
    fatura_id
  ) values (
    p_escritorio_id,
    p_caso_id,
    p_geracao_id,
    v_competencia,
    v_tipo,
    v_fatura_id
  );

  update public.casos
  set
    competencia_franquia = v_competencia,
    fatura_excedente_id = v_fatura_id,
    status = 'producao'::public.caso_status
  where id = p_caso_id and escritorio_id = p_escritorio_id;

  return v_tipo;
end;
$$;

create or replace function public.finalizar_consumo_peca(
  p_geracao_id uuid,
  p_status public.consumo_peca_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in (
    'concluido'::public.consumo_peca_status,
    'cancelado'::public.consumo_peca_status
  ) then
    raise exception 'STATUS_CONSUMO_INVALIDO' using errcode = '22023';
  end if;

  update public.consumos_peca
  set status = p_status, finalizado_em = now()
  where geracao_id = p_geracao_id
    and status = 'reservado'::public.consumo_peca_status;
end;
$$;

create or replace function public.concluir_geracao_motor(
  p_geracao_id uuid,
  p_custo_usd numeric,
  p_custo_brl numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_geracao public.geracoes%rowtype;
begin
  select * into v_geracao
  from public.geracoes
  where id = p_geracao_id
  for update;

  if not found then
    raise exception 'GERACAO_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;

  update public.geracoes
  set
    status = 'concluida'::public.geracao_status,
    etapa_atual = 'concluida',
    custo_usd = p_custo_usd,
    custo_brl = p_custo_brl,
    finalizado_em = now()
  where id = p_geracao_id;

  update public.casos
  set status = 'qa'::public.caso_status
  where id = v_geracao.caso_id
    and escritorio_id = v_geracao.escritorio_id;

  update public.consumos_peca
  set status = 'concluido'::public.consumo_peca_status, finalizado_em = now()
  where geracao_id = p_geracao_id
    and status = 'reservado'::public.consumo_peca_status;
end;
$$;

create or replace function public.falhar_geracao_motor(
  p_geracao_id uuid,
  p_erro_codigo text,
  p_erro_detalhe text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_geracao public.geracoes%rowtype;
begin
  select * into v_geracao
  from public.geracoes
  where id = p_geracao_id
  for update;

  if not found then
    return;
  end if;

  update public.geracoes
  set
    status = 'falhou'::public.geracao_status,
    erro_codigo = left(p_erro_codigo, 120),
    erro_detalhe = left(p_erro_detalhe, 500),
    finalizado_em = now()
  where id = p_geracao_id
    and status <> 'concluida'::public.geracao_status;

  update public.casos
  set status = 'recebido'::public.caso_status
  where id = v_geracao.caso_id
    and escritorio_id = v_geracao.escritorio_id
    and status = 'producao'::public.caso_status;

  update public.consumos_peca
  set status = 'cancelado'::public.consumo_peca_status, finalizado_em = now()
  where geracao_id = p_geracao_id
    and status = 'reservado'::public.consumo_peca_status;
end;
$$;

revoke all on function public.checar_teto_geracao(uuid, uuid, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.autorizar_geracao_caso(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finalizar_consumo_peca(uuid, public.consumo_peca_status)
  from public, anon, authenticated;
revoke all on function public.concluir_geracao_motor(uuid, numeric, numeric)
  from public, anon, authenticated;
revoke all on function public.falhar_geracao_motor(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.checar_teto_geracao(uuid, uuid, numeric, numeric)
  to service_role;
grant execute on function public.autorizar_geracao_caso(uuid, uuid, uuid)
  to service_role;
grant execute on function public.finalizar_consumo_peca(uuid, public.consumo_peca_status)
  to service_role;
grant execute on function public.concluir_geracao_motor(uuid, numeric, numeric)
  to service_role;
grant execute on function public.falhar_geracao_motor(uuid, text, text)
  to service_role;

alter table public.geracoes enable row level security;
alter table public.consumos_peca enable row level security;

revoke all on public.geracoes from anon, authenticated;
revoke all on public.consumos_peca from anon, authenticated;
grant all on public.geracoes to service_role;
grant all on public.consumos_peca to service_role;
grant select on public.consumos_peca to authenticated;

create policy consumos_peca_select_own
on public.consumos_peca for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger escritorios_set_atualizado_em before update on public.escritorios
  for each row execute function public.set_atualizado_em();
create trigger usuarios_set_atualizado_em before update on public.usuarios
  for each row execute function public.set_atualizado_em();
create trigger modelos_set_atualizado_em before update on public.modelos_escritorio
  for each row execute function public.set_atualizado_em();
create trigger casos_set_atualizado_em before update on public.casos
  for each row execute function public.set_atualizado_em();
create trigger teses_set_atualizado_em before update on public.teses
  for each row execute function public.set_atualizado_em();
create trigger jurisprudencia_set_atualizado_em before update on public.jurisprudencia
  for each row execute function public.set_atualizado_em();
create trigger assinaturas_set_atualizado_em before update on public.assinaturas
  for each row execute function public.set_atualizado_em();
create trigger faturas_set_atualizado_em before update on public.faturas
  for each row execute function public.set_atualizado_em();

create or replace function public.audit_caso_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status then
    insert into public.auditoria (
      escritorio_id,
      caso_id,
      evento,
      autor_usuario_id,
      autor,
      metadata
    ) values (
      new.escritorio_id,
      new.id,
      'caso.status_alterado',
      (select auth.uid()),
      case when (select auth.uid()) is null then 'sistema' else 'usuario' end,
      jsonb_build_object('de', old.status, 'para', new.status)
    );
  end if;

  return new;
end;
$$;

create trigger casos_audit_status
  after update of status on public.casos
  for each row execute function public.audit_caso_status_change();

create or replace function public.reservar_uso_tokens(
  p_escritorio_id uuid,
  p_caso_id uuid,
  p_request_id uuid,
  p_provedor text,
  p_etapa text,
  p_modelo text,
  p_custo_reservado_usd numeric,
  p_tokens_reservados bigint,
  p_limite_global_usd numeric,
  p_limite_peca_usd numeric
)
returns uuid
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
  v_uso_id uuid;
begin
  if p_custo_reservado_usd < 0 or p_tokens_reservados < 0 then
    raise exception 'RESERVA_INVALIDA' using errcode = '22023';
  end if;

  if p_limite_global_usd <= 0 or p_limite_peca_usd <= 0 then
    raise exception 'LIMITE_INVALIDO' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cortex:spend-cap:' || to_char(v_inicio_mes, 'YYYY-MM'), 0)
  );

  select * into v_escritorio
  from public.escritorios
  where id = p_escritorio_id
  for update;

  if not found then
    raise exception 'ESCRITORIO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;

  select
    coalesce(sum(
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
        else input_tokens + output_tokens + cache_read_input_tokens + cache_creation_input_tokens
      end
    ), 0)
  into v_gasto_escritorio, v_tokens_escritorio
  from public.uso_tokens
  where escritorio_id = p_escritorio_id
    and criado_em >= v_inicio_mes
    and status <> 'cancelada'::public.uso_status;

  select
    coalesce(sum(
      case when status = 'reservada'::public.uso_status
        then custo_reservado_usd else custo_usd end
    ), 0)
  into v_gasto_peca
  from public.uso_tokens
  where caso_id = p_caso_id
    and status <> 'cancelada'::public.uso_status;

  if v_gasto_global + p_custo_reservado_usd > p_limite_global_usd then
    raise exception 'TETO_ATINGIDO' using errcode = 'P0001', detail = 'GLOBAL';
  end if;

  if v_escritorio.teto_gasto_mensal_usd is not null
    and v_gasto_escritorio + p_custo_reservado_usd > v_escritorio.teto_gasto_mensal_usd then
    raise exception 'TETO_ATINGIDO' using errcode = 'P0001', detail = 'ESCRITORIO_USD';
  end if;

  if v_escritorio.teto_token_mensal is not null
    and v_tokens_escritorio + p_tokens_reservados > v_escritorio.teto_token_mensal then
    raise exception 'TETO_ATINGIDO' using errcode = 'P0001', detail = 'ESCRITORIO_TOKENS';
  end if;

  if v_gasto_peca + p_custo_reservado_usd > p_limite_peca_usd then
    raise exception 'TETO_ATINGIDO' using errcode = 'P0001', detail = 'PECA';
  end if;

  insert into public.uso_tokens (
    escritorio_id,
    caso_id,
    request_id,
    provedor,
    etapa,
    modelo,
    tokens_reservados,
    custo_reservado_usd
  ) values (
    p_escritorio_id,
    p_caso_id,
    p_request_id,
    p_provedor,
    p_etapa,
    p_modelo,
    p_tokens_reservados,
    p_custo_reservado_usd
  )
  returning id into v_uso_id;

  return v_uso_id;
end;
$$;

create or replace function public.finalizar_uso_tokens(
  p_uso_id uuid,
  p_status public.uso_status,
  p_input_tokens bigint,
  p_output_tokens bigint,
  p_cache_read_input_tokens bigint,
  p_cache_creation_input_tokens bigint,
  p_custo_usd numeric,
  p_cotacao_usd_brl numeric,
  p_erro_codigo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('concluida'::public.uso_status, 'falhou'::public.uso_status) then
    raise exception 'STATUS_FINAL_INVALIDO' using errcode = '22023';
  end if;

  if least(
    p_input_tokens,
    p_output_tokens,
    p_cache_read_input_tokens,
    p_cache_creation_input_tokens,
    p_custo_usd,
    p_cotacao_usd_brl
  ) < 0 then
    raise exception 'USO_INVALIDO' using errcode = '22023';
  end if;

  update public.uso_tokens
  set
    status = p_status,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    cache_read_input_tokens = p_cache_read_input_tokens,
    cache_creation_input_tokens = p_cache_creation_input_tokens,
    custo_usd = p_custo_usd,
    cotacao_usd_brl = p_cotacao_usd_brl,
    custo_brl = p_custo_usd * p_cotacao_usd_brl,
    erro_codigo = p_erro_codigo,
    finalizado_em = now()
  where id = p_uso_id
    and status = 'reservada'::public.uso_status;

  if not found then
    raise exception 'RESERVA_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.reservar_uso_tokens(
  uuid, uuid, uuid, text, text, text, numeric, bigint, numeric, numeric
) from public, anon, authenticated;
revoke all on function public.finalizar_uso_tokens(
  uuid, public.uso_status, bigint, bigint, bigint, bigint, numeric, numeric, text
) from public, anon, authenticated;
grant execute on function public.reservar_uso_tokens(
  uuid, uuid, uuid, text, text, text, numeric, bigint, numeric, numeric
) to service_role;
grant execute on function public.finalizar_uso_tokens(
  uuid, public.uso_status, bigint, bigint, bigint, bigint, numeric, numeric, text
) to service_role;

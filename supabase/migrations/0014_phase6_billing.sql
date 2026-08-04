set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.escritorios
  add column asaas_customer_id text;
create unique index escritorios_asaas_customer_id_idx
  on public.escritorios(asaas_customer_id) where asaas_customer_id is not null;

alter table public.assinaturas
  add column asaas_subscription_id text;
create unique index assinaturas_asaas_subscription_id_idx
  on public.assinaturas(asaas_subscription_id) where asaas_subscription_id is not null;

update public.assinaturas
set asaas_subscription_id = asaas_id
where asaas_id is not null and asaas_subscription_id is null;

alter table public.faturas
  add column asaas_payment_id text;
create unique index faturas_asaas_payment_id_idx
  on public.faturas(asaas_payment_id) where asaas_payment_id is not null;

create unique index faturas_setup_unica_por_escritorio_idx
  on public.faturas(escritorio_id) where tipo = 'setup';

update public.faturas
set asaas_payment_id = asaas_id
where asaas_id is not null and asaas_payment_id is null;

create table public.webhook_eventos (
  id uuid primary key default extensions.gen_random_uuid(),
  asaas_event_id text not null unique check (char_length(asaas_event_id) between 1 and 200),
  tipo text not null check (char_length(tipo) between 1 and 100),
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  processado_em timestamptz not null default now(),
  resultado text not null check (resultado in ('processado', 'ignorado')),
  criado_em timestamptz not null default now()
);

create table public.creditos_peca (
  id uuid primary key default extensions.gen_random_uuid(),
  escritorio_id uuid not null references public.escritorios(id) on delete cascade,
  quantidade integer not null check (quantidade > 0),
  origem text not null default 'addon' check (origem = 'addon'),
  fatura_id uuid not null unique,
  consumido integer not null default 0 check (consumido >= 0 and consumido <= quantidade),
  criado_em timestamptz not null default now(),
  foreign key (fatura_id, escritorio_id)
    references public.faturas(id, escritorio_id) on delete cascade
);

create index creditos_peca_disponiveis_idx
  on public.creditos_peca(escritorio_id, criado_em)
  where consumido < quantidade;

alter table public.creditos_peca enable row level security;
alter table public.webhook_eventos enable row level security;

revoke all on public.creditos_peca from public, anon, authenticated;
revoke all on public.webhook_eventos from public, anon, authenticated;
grant all on public.creditos_peca to service_role;
grant all on public.webhook_eventos to service_role;
grant select on public.creditos_peca to authenticated;

create policy creditos_peca_select_own
on public.creditos_peca for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create or replace function public.creditar_pecas_addon(p_fatura_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fatura public.faturas%rowtype;
  v_credito_id uuid;
begin
  select * into v_fatura
  from public.faturas
  where id = p_fatura_id
  for update;

  if not found or v_fatura.tipo <> 'addon'::public.fatura_tipo
    or v_fatura.status <> 'paga'::public.fatura_status then
    raise exception 'FATURA_ADDON_NAO_PAGA' using errcode = '22023';
  end if;

  insert into public.creditos_peca (escritorio_id, quantidade, fatura_id)
  values (v_fatura.escritorio_id, coalesce(v_fatura.quantidade_pecas, 1), v_fatura.id)
  on conflict (fatura_id) do update set fatura_id = excluded.fatura_id
  returning id into v_credito_id;

  return v_credito_id;
end;
$$;

create or replace function public.processar_evento_asaas(
  p_event_id text,
  p_event_type text,
  p_payload_hash text,
  p_resource_id text,
  p_resource_status text,
  p_valor_centavos integer default null,
  p_subscription_id text default null,
  p_due_date date default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fatura public.faturas%rowtype;
  v_assinatura public.assinaturas%rowtype;
  v_rows integer;
  v_resultado text := 'processado';
begin
  if p_event_id is null or char_length(p_event_id) not between 1 and 200
    or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'EVENTO_ASAAS_INVALIDO' using errcode = '22023';
  end if;

  insert into public.webhook_eventos (asaas_event_id, tipo, payload_hash, resultado)
  values (p_event_id, p_event_type, p_payload_hash, 'processado')
  on conflict (asaas_event_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return 'duplicado'; end if;

  if p_event_type = 'SUBSCRIPTION_DELETED' then
    select * into v_assinatura from public.assinaturas
    where asaas_subscription_id = p_resource_id for update;
    if not found then
      update public.webhook_eventos set resultado = 'ignorado' where asaas_event_id = p_event_id;
      return 'ignorado';
    end if;
    update public.assinaturas set status = 'cancelada', cancelado_em = now()
      where id = v_assinatura.id;
    update public.escritorios set status = 'cancelado'
      where id = v_assinatura.escritorio_id;
    insert into public.auditoria (escritorio_id, evento, autor, evento_externo_id, metadata)
      values (v_assinatura.escritorio_id, 'cobranca.assinatura_cancelada', 'asaas', p_event_id,
        jsonb_build_object('assinatura_id', v_assinatura.id));
    return v_resultado;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cortex:asaas:' || p_resource_id, 0));
  select * into v_fatura from public.faturas
  where asaas_payment_id = p_resource_id for update;
  if not found and p_subscription_id is not null then
    select * into v_assinatura from public.assinaturas
    where asaas_subscription_id = p_subscription_id for update;
    if found then
      insert into public.faturas (escritorio_id, assinatura_id, valor_centavos, tipo, status, asaas_payment_id, asaas_id, competencia, vencimento, metadata)
      values (v_assinatura.escritorio_id, v_assinatura.id, p_valor_centavos, 'mensal', 'pendente', p_resource_id, p_resource_id,
        date_trunc('month', coalesce(p_due_date, current_date))::date, p_due_date, jsonb_build_object('environment', 'sandbox'));
      select * into v_fatura from public.faturas where asaas_payment_id = p_resource_id for update;
    end if;
  end if;
  if not found then
    update public.webhook_eventos set resultado = 'ignorado' where asaas_event_id = p_event_id;
    return 'ignorado';
  end if;
  if p_valor_centavos is null or p_valor_centavos <> v_fatura.valor_centavos then
    raise exception 'VALOR_ASAAS_DIVERGENTE' using errcode = '22023';
  end if;

  if p_event_type in ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED') then
    if p_resource_status not in ('CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH') then
      raise exception 'STATUS_ASAAS_NAO_CONFIRMADO' using errcode = '22023';
    end if;
    update public.faturas set status = 'paga', pago_em = coalesce(pago_em, now()) where id = v_fatura.id;
    if v_fatura.tipo = 'addon'::public.fatura_tipo then
      perform public.creditar_pecas_addon(v_fatura.id);
    elsif v_fatura.tipo = 'mensal'::public.fatura_tipo and v_fatura.assinatura_id is not null then
      update public.assinaturas set status = 'ativa' where id = v_fatura.assinatura_id;
    end if;
    if not exists (select 1 from public.faturas where escritorio_id = v_fatura.escritorio_id and status = 'vencida' and id <> v_fatura.id) then
      update public.escritorios set status = 'ativo' where id = v_fatura.escritorio_id and status <> 'cancelado';
    end if;
  elsif p_event_type = 'PAYMENT_OVERDUE' then
    if p_resource_status <> 'OVERDUE' then raise exception 'STATUS_ASAAS_NAO_VENCIDO' using errcode = '22023'; end if;
    update public.faturas set status = 'vencida' where id = v_fatura.id;
    update public.assinaturas set status = 'inadimplente' where id = v_fatura.assinatura_id;
    update public.escritorios set status = 'inadimplente' where id = v_fatura.escritorio_id and status <> 'cancelado';
  elsif p_event_type in ('PAYMENT_REFUNDED', 'PAYMENT_DELETED') then
    if p_resource_status not in ('REFUNDED', 'REFUND_REQUESTED', 'DELETED') then
      raise exception 'STATUS_ASAAS_NAO_ESTORNADO' using errcode = '22023';
    end if;
    update public.faturas set status = 'cancelada' where id = v_fatura.id;
    if v_fatura.tipo = 'addon'::public.fatura_tipo then
      delete from public.creditos_peca where fatura_id = v_fatura.id and consumido = 0;
      update public.creditos_peca set quantidade = consumido where fatura_id = v_fatura.id and consumido > 0;
    elsif v_fatura.tipo in ('setup'::public.fatura_tipo, 'mensal'::public.fatura_tipo) then
      update public.escritorios set status = 'inadimplente' where id = v_fatura.escritorio_id and status <> 'cancelado';
    end if;
  else
    update public.webhook_eventos set resultado = 'ignorado' where asaas_event_id = p_event_id;
    return 'ignorado';
  end if;

  insert into public.auditoria (escritorio_id, evento, autor, evento_externo_id, metadata)
  values (v_fatura.escritorio_id, 'cobranca.' || lower(p_event_type), 'asaas', p_event_id,
    jsonb_build_object('fatura_id', v_fatura.id, 'tipo', v_fatura.tipo));
  return v_resultado;
end;
$$;

-- O motor continua sendo a única porta de autorização comercial. Créditos pagos
-- são vinculados à fatura já usada por consumos_peca e reservados sob o mesmo lock.
create or replace function public.reservar_credito_addon(p_escritorio_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_credito public.creditos_peca%rowtype;
begin
  select * into v_credito from public.creditos_peca
  where escritorio_id = p_escritorio_id and consumido < quantidade
  order by criado_em, id for update skip locked limit 1;
  if not found then return null; end if;
  update public.creditos_peca set consumido = consumido + 1 where id = v_credito.id;
  return v_credito.fatura_id;
end;
$$;

create or replace function public.liberar_credito_addon(p_fatura_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.creditos_peca set consumido = greatest(consumido - 1, 0)
  where fatura_id = p_fatura_id;
$$;

revoke all on function public.creditar_pecas_addon(uuid) from public, anon, authenticated;
revoke all on function public.processar_evento_asaas(text, text, text, text, text, integer, text, date) from public, anon, authenticated;
revoke all on function public.reservar_credito_addon(uuid) from public, anon, authenticated;
revoke all on function public.liberar_credito_addon(uuid) from public, anon, authenticated;
grant execute on function public.creditar_pecas_addon(uuid) to service_role;
grant execute on function public.processar_evento_asaas(text, text, text, text, text, integer, text, date) to service_role;
grant execute on function public.reservar_credito_addon(uuid) to service_role;
grant execute on function public.liberar_credito_addon(uuid) to service_role;

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
  v_fatura_id uuid;
  v_tipo public.consumo_peca_tipo;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('cortex:billing:' || p_escritorio_id::text || ':' || v_competencia::text, 0)
  );
  select * into v_escritorio from public.escritorios where id = p_escritorio_id for update;
  if not found then raise exception 'ESCRITORIO_NAO_ENCONTRADO' using errcode = 'P0002'; end if;

  if v_escritorio.status in ('suspenso', 'inadimplente', 'cancelado')
    or exists (select 1 from public.assinaturas where escritorio_id = p_escritorio_id and status = 'inadimplente')
    or exists (select 1 from public.faturas where escritorio_id = p_escritorio_id and status = 'vencida') then
    raise exception 'INADIMPLENTE' using errcode = 'P0001', detail = v_escritorio.status::text;
  end if;
  if not exists (select 1 from public.casos where id = p_caso_id and escritorio_id = p_escritorio_id) then
    raise exception 'CASO_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.geracoes where id = p_geracao_id and caso_id = p_caso_id and escritorio_id = p_escritorio_id) then
    raise exception 'GERACAO_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;
  select tipo into v_tipo from public.consumos_peca where geracao_id = p_geracao_id;
  if found then return v_tipo; end if;

  select count(*) into v_consumidas from public.consumos_peca
  where escritorio_id = p_escritorio_id and competencia = v_competencia
    and tipo = 'franquia' and status in ('reservado', 'concluido');
  if v_consumidas < v_escritorio.franquia_pecas_mensal then
    v_tipo := 'franquia';
  else
    v_fatura_id := public.reservar_credito_addon(p_escritorio_id);
    if v_fatura_id is null then raise exception 'EXCEDENTE_NAO_PAGO' using errcode = 'P0001'; end if;
    v_tipo := 'excedente';
  end if;

  insert into public.consumos_peca (escritorio_id, caso_id, geracao_id, competencia, tipo, fatura_id)
  values (p_escritorio_id, p_caso_id, p_geracao_id, v_competencia, v_tipo, v_fatura_id);
  update public.casos set competencia_franquia = v_competencia, fatura_excedente_id = v_fatura_id, status = 'producao'
  where id = p_caso_id and escritorio_id = p_escritorio_id;
  return v_tipo;
end;
$$;

create or replace function public.finalizar_consumo_peca(p_geracao_id uuid, p_status public.consumo_peca_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_fatura_id uuid;
begin
  if p_status not in ('concluido', 'cancelado') then raise exception 'STATUS_CONSUMO_INVALIDO' using errcode = '22023'; end if;
  select fatura_id into v_fatura_id from public.consumos_peca where geracao_id = p_geracao_id and status = 'reservado' for update;
  update public.consumos_peca set status = p_status, finalizado_em = now()
  where geracao_id = p_geracao_id and status = 'reservado';
  if p_status = 'cancelado' and v_fatura_id is not null then perform public.liberar_credito_addon(v_fatura_id); end if;
end;
$$;

create or replace function public.falhar_geracao_motor(p_geracao_id uuid, p_erro_codigo text, p_erro_detalhe text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_geracao public.geracoes%rowtype; v_fatura_id uuid;
begin
  select * into v_geracao from public.geracoes where id = p_geracao_id for update;
  if not found then return; end if;
  select fatura_id into v_fatura_id from public.consumos_peca where geracao_id = p_geracao_id and status = 'reservado' for update;
  update public.geracoes set status = 'falhou', erro_codigo = left(p_erro_codigo, 120), erro_detalhe = left(p_erro_detalhe, 500), finalizado_em = now()
  where id = p_geracao_id and status <> 'concluida';
  update public.casos set status = 'recebido' where id = v_geracao.caso_id and escritorio_id = v_geracao.escritorio_id and status = 'producao';
  update public.consumos_peca set status = 'cancelado', finalizado_em = now() where geracao_id = p_geracao_id and status = 'reservado';
  if v_fatura_id is not null then perform public.liberar_credito_addon(v_fatura_id); end if;
end;
$$;

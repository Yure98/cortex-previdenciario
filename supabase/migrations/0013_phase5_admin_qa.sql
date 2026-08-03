set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.entregas
  add column platform_revisado_por uuid references auth.users(id) on delete set null,
  add column revisado_em timestamptz;

create or replace function public.audit_caso_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := (select auth.uid());
  v_platform_admin boolean := public.is_platform_admin();
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
      case when v_platform_admin then null else v_usuario_id end,
      case
        when v_usuario_id is null then 'sistema'
        when v_platform_admin then 'platform_admin'
        else 'usuario'
      end,
      jsonb_build_object('de', old.status, 'para', new.status)
        || case
          when v_platform_admin then jsonb_build_object('platform_admin_id', v_usuario_id)
          else '{}'::jsonb
        end
    );
  end if;

  return new;
end;
$$;

create or replace function public.admin_atualizar_status_caso(p_caso_id uuid, p_status public.caso_status)
returns void language plpgsql security definer set search_path = '' as $$
declare v_caso public.casos%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'ACESSO_NEGADO' using errcode = '42501'; end if;
  select * into v_caso from public.casos where id = p_caso_id for update;
  if not found then raise exception 'CASO_NAO_ENCONTRADO' using errcode = 'P0002'; end if;
  update public.casos set status = p_status, entregue_em = case when p_status = 'entregue'::public.caso_status then coalesce(entregue_em, now()) else null end where id = p_caso_id;
  insert into public.auditoria (escritorio_id, caso_id, evento, autor, metadata)
  values (v_caso.escritorio_id, v_caso.id, 'status_alterado_admin', 'platform_admin', jsonb_build_object('de', v_caso.status::text, 'para', p_status::text, 'platform_admin_id', (select auth.uid())));
end; $$;

create or replace function public.admin_revisar_entrega(p_entrega_id uuid, p_qa_status public.qa_status, p_checklist jsonb, p_observacoes text default null, p_entregar boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_entrega public.entregas%rowtype;
begin
  if not public.is_platform_admin() then raise exception 'ACESSO_NEGADO' using errcode = '42501'; end if;
  if jsonb_typeof(coalesce(p_checklist, '{}'::jsonb)) <> 'object' or octet_length(coalesce(p_checklist, '{}'::jsonb)::text) > 10000 or char_length(coalesce(p_observacoes, '')) > 5000 then raise exception 'QA_INVALIDO' using errcode = '22023'; end if;
  if p_entregar and p_qa_status <> 'aprovado'::public.qa_status then raise exception 'QA_NAO_APROVADO' using errcode = '22023'; end if;
  if p_entregar and not coalesce(p_checklist, '{}'::jsonb) @> '{"identificacao":true,"fatos":true,"fundamentacao":true,"pedidos":true,"citacoes":true,"campos_conferir":true}'::jsonb then raise exception 'CHECKLIST_INCOMPLETO' using errcode = '22023'; end if;
  select * into v_entrega from public.entregas where id = p_entrega_id for update;
  if not found then raise exception 'ENTREGA_NAO_ENCONTRADA' using errcode = 'P0002'; end if;
  update public.entregas set qa_status = p_qa_status, qa_checklist = coalesce(p_checklist, '{}'::jsonb), qa_observacoes = nullif(btrim(p_observacoes), ''), platform_revisado_por = (select auth.uid()), revisado_em = now(), enviado_em = case when p_entregar then coalesce(enviado_em, now()) else enviado_em end where id = p_entrega_id;
  update public.casos set status = case when p_entregar then 'entregue'::public.caso_status else 'qa'::public.caso_status end, entregue_em = case when p_entregar then coalesce(entregue_em, now()) else entregue_em end where id = v_entrega.caso_id and escritorio_id = v_entrega.escritorio_id;
  insert into public.auditoria (escritorio_id, caso_id, evento, autor, metadata) values (v_entrega.escritorio_id, v_entrega.caso_id, case when p_entregar then 'caso_entregue_admin' else 'qa_revisado_admin' end, 'platform_admin', jsonb_build_object('entrega_id', v_entrega.id, 'qa_status', p_qa_status::text, 'platform_admin_id', (select auth.uid())));
end; $$;

revoke all on function public.admin_atualizar_status_caso(uuid, public.caso_status) from public, anon;
revoke all on function public.admin_revisar_entrega(uuid, public.qa_status, jsonb, text, boolean) from public, anon;
grant execute on function public.admin_atualizar_status_caso(uuid, public.caso_status) to authenticated, service_role;
grant execute on function public.admin_revisar_entrega(uuid, public.qa_status, jsonb, text, boolean) to authenticated, service_role;

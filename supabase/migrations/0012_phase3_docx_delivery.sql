set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.entregas
  add column geracao_id uuid,
  add column nome_arquivo text,
  add column mime_type text not null default
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  add column tamanho_bytes bigint,
  add column sha256 text,
  add column preflight jsonb not null default '{}'::jsonb,
  add constraint entregas_geracao_escritorio_fk
    foreign key (geracao_id, escritorio_id)
    references public.geracoes(id, escritorio_id) on delete restrict,
  add constraint entregas_nome_arquivo_seguro check (
    nome_arquivo is null
    or nome_arquivo ~ '^peticao_[a-z0-9_]+_[0-9]{4}-[0-9]{2}-[0-9]{2}\.docx$'
  ),
  add constraint entregas_mime_docx check (
    mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ),
  add constraint entregas_tamanho_positivo check (
    tamanho_bytes is null or tamanho_bytes > 0
  ),
  add constraint entregas_sha256_valido check (
    sha256 is null or sha256 ~ '^[0-9a-f]{64}$'
  ),
  add constraint entregas_preflight_objeto check (
    jsonb_typeof(preflight) = 'object'
  );

create unique index entregas_geracao_unica_idx
  on public.entregas(geracao_id)
  where geracao_id is not null;

create or replace function public.registrar_entrega_concluir_geracao(
  p_geracao_id uuid,
  p_arquivo_path text,
  p_nome_arquivo text,
  p_tamanho_bytes bigint,
  p_sha256 text,
  p_preflight jsonb,
  p_custo_usd numeric,
  p_custo_brl numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_geracao public.geracoes%rowtype;
  v_entrega_id uuid;
  v_versao integer;
begin
  select * into v_geracao
  from public.geracoes
  where id = p_geracao_id
  for update;

  if not found then
    raise exception 'GERACAO_NAO_ENCONTRADA' using errcode = 'P0002';
  end if;

  select e.id into v_entrega_id
  from public.entregas e
  where e.geracao_id = p_geracao_id;

  if found then
    return v_entrega_id;
  end if;

  if v_geracao.status = 'falhou'::public.geracao_status then
    raise exception 'GERACAO_JA_FALHOU' using errcode = 'P0001';
  end if;

  if split_part(p_arquivo_path, '/', 1) <> v_geracao.escritorio_id::text then
    raise exception 'ARQUIVO_FORA_DO_ESCRITORIO' using errcode = '22023';
  end if;

  if p_nome_arquivo !~ '^peticao_[a-z0-9_]+_[0-9]{4}-[0-9]{2}-[0-9]{2}\.docx$'
    or p_tamanho_bytes <= 0
    or p_sha256 !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(coalesce(p_preflight, '{}'::jsonb)) <> 'object' then
    raise exception 'ENTREGA_INVALIDA' using errcode = '22023';
  end if;

  select coalesce(max(e.versao), 0) + 1 into v_versao
  from public.entregas e
  where e.caso_id = v_geracao.caso_id
    and e.escritorio_id = v_geracao.escritorio_id;

  insert into public.entregas (
    escritorio_id,
    caso_id,
    geracao_id,
    arquivo_path,
    nome_arquivo,
    mime_type,
    tamanho_bytes,
    sha256,
    preflight,
    versao,
    qa_status
  ) values (
    v_geracao.escritorio_id,
    v_geracao.caso_id,
    v_geracao.id,
    p_arquivo_path,
    p_nome_arquivo,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    p_tamanho_bytes,
    p_sha256,
    coalesce(p_preflight, '{}'::jsonb),
    v_versao,
    'pendente'::public.qa_status
  ) returning id into v_entrega_id;

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

  insert into public.auditoria (
    escritorio_id,
    caso_id,
    evento,
    autor,
    metadata
  ) values (
    v_geracao.escritorio_id,
    v_geracao.caso_id,
    'entrega_docx_gerada',
    'motor',
    jsonb_build_object(
      'geracao_id', v_geracao.id,
      'entrega_id', v_entrega_id,
      'versao', v_versao,
      'sha256', p_sha256
    )
  );

  return v_entrega_id;
end;
$$;

revoke all on function public.registrar_entrega_concluir_geracao(
  uuid, text, text, bigint, text, jsonb, numeric, numeric
) from public, anon, authenticated;

grant execute on function public.registrar_entrega_concluir_geracao(
  uuid, text, text, bigint, text, jsonb, numeric, numeric
) to service_role;

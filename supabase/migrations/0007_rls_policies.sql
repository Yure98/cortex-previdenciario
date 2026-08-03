set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.escritorios enable row level security;
alter table public.usuarios enable row level security;
alter table public.modelos_escritorio enable row level security;
alter table public.casos enable row level security;
alter table public.documentos enable row level security;
alter table public.entregas enable row level security;
alter table public.auditoria enable row level security;
alter table public.feedback enable row level security;
alter table public.teses enable row level security;
alter table public.jurisprudencia enable row level security;
alter table public.caso_teses enable row level security;
alter table public.assinaturas enable row level security;
alter table public.faturas enable row level security;
alter table public.uso_tokens enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant select on public.escritorios to authenticated;
grant update (
  nome,
  oab,
  cidade,
  timbrado_path,
  cor_primaria,
  cor_secundaria,
  cor_acento,
  notebooklm_url,
  data_onboarding
) on public.escritorios to authenticated;

grant select on public.usuarios to authenticated;
grant update (nome) on public.usuarios to authenticated;

grant select on public.modelos_escritorio to authenticated;
grant insert (escritorio_id, nome, arquivo_path, tipo, ativo, enviado_por)
  on public.modelos_escritorio to authenticated;
grant update (nome, arquivo_path, tipo, ativo)
  on public.modelos_escritorio to authenticated;
grant delete on public.modelos_escritorio to authenticated;

grant select on public.casos to authenticated;
grant insert (
  escritorio_id,
  cliente_final,
  beneficio,
  tipo_peca,
  formato,
  pesquisou_juris,
  fatos,
  pedidos,
  inputs
) on public.casos to authenticated;
grant update (
  cliente_final,
  beneficio,
  tipo_peca,
  formato,
  pesquisou_juris,
  fatos,
  pedidos,
  inputs
) on public.casos to authenticated;

grant select on public.documentos to authenticated;
grant select on public.entregas to authenticated;
grant select on public.auditoria to authenticated;
grant select on public.feedback to authenticated;
grant insert (escritorio_id, caso_id, usuario_id, nota, comentario)
  on public.feedback to authenticated;
grant select on public.teses to authenticated;
grant select on public.jurisprudencia to authenticated;
grant select on public.caso_teses to authenticated;
grant select on public.assinaturas to authenticated;
grant select on public.faturas to authenticated;
grant select on public.uso_tokens to authenticated;

create policy escritorios_select_own
on public.escritorios for select
to authenticated
using (id = (select public.current_escritorio_id()));

create policy escritorios_update_own
on public.escritorios for update
to authenticated
using (id = (select public.current_escritorio_id()))
with check (id = (select public.current_escritorio_id()));

create policy usuarios_select_same_office
on public.usuarios for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy usuarios_update_self
on public.usuarios for update
to authenticated
using (id = (select auth.uid()) and escritorio_id = (select public.current_escritorio_id()))
with check (id = (select auth.uid()) and escritorio_id = (select public.current_escritorio_id()));

create policy modelos_select_own
on public.modelos_escritorio for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy modelos_insert_own
on public.modelos_escritorio for insert
to authenticated
with check (
  escritorio_id = (select public.current_escritorio_id())
  and enviado_por = (select auth.uid())
);

create policy modelos_update_own
on public.modelos_escritorio for update
to authenticated
using (escritorio_id = (select public.current_escritorio_id()))
with check (escritorio_id = (select public.current_escritorio_id()));

create policy modelos_delete_own
on public.modelos_escritorio for delete
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy casos_select_own
on public.casos for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy casos_insert_own
on public.casos for insert
to authenticated
with check (escritorio_id = (select public.current_escritorio_id()));

create policy casos_update_own
on public.casos for update
to authenticated
using (escritorio_id = (select public.current_escritorio_id()))
with check (escritorio_id = (select public.current_escritorio_id()));

create policy documentos_select_own
on public.documentos for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy entregas_select_own
on public.entregas for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy auditoria_select_own
on public.auditoria for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy feedback_select_own
on public.feedback for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy feedback_insert_own
on public.feedback for insert
to authenticated
with check (
  escritorio_id = (select public.current_escritorio_id())
  and usuario_id = (select auth.uid())
  and exists (
    select 1
    from public.casos c
    where c.id = caso_id
      and c.escritorio_id = (select public.current_escritorio_id())
  )
);

create policy teses_select_active_shared
on public.teses for select
to authenticated
using (status = 'ativa'::public.tese_status);

create policy jurisprudencia_select_public_or_own
on public.jurisprudencia for select
to authenticated
using (
  (fonte_publica and status = 'ativa'::public.tese_status)
  or escritorio_id = (select public.current_escritorio_id())
);

create policy caso_teses_select_own
on public.caso_teses for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy assinaturas_select_own
on public.assinaturas for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy faturas_select_own
on public.faturas for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

create policy uso_tokens_select_own
on public.uso_tokens for select
to authenticated
using (escritorio_id = (select public.current_escritorio_id()));

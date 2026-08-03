begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'a@cortex.test',
    '',
    now(),
    '{}'::jsonb,
    '{"nome":"Usuario A","escritorio_nome":"Escritorio A"}'::jsonb,
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'b@cortex.test',
    '',
    now(),
    '{}'::jsonb,
    '{"nome":"Usuario B","escritorio_nome":"Escritorio B"}'::jsonb,
    now(),
    now()
  );

insert into public.casos (id, escritorio_id, cliente_final, beneficio, tipo_peca)
select '30000000-0000-0000-0000-000000000003', escritorio_id, 'Cliente A', 'incapacidade', 'peticao'
from public.usuarios where id = '10000000-0000-0000-0000-000000000001';

insert into public.casos (id, escritorio_id, cliente_final, beneficio, tipo_peca)
select '40000000-0000-0000-0000-000000000004', escritorio_id, 'Cliente B', 'rural', 'peticao'
from public.usuarios where id = '20000000-0000-0000-0000-000000000002';

insert into public.entregas (id, escritorio_id, caso_id, arquivo_path)
select '50000000-0000-0000-0000-000000000005', escritorio_id, id, escritorio_id::text || '/' || id::text || '/entrega-a.docx'
from public.casos where cliente_final = 'Cliente A';

insert into public.entregas (id, escritorio_id, caso_id, arquivo_path)
select '60000000-0000-0000-0000-000000000006', escritorio_id, id, escritorio_id::text || '/' || id::text || '/entrega-b.docx'
from public.casos where cliente_final = 'Cliente B';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$select count(*)::bigint from public.escritorios$$,
  array[1::bigint],
  'usuário vê somente o próprio escritório'
);
select results_eq(
  $$select count(*)::bigint from public.entregas$$,
  array[1::bigint],
  'usuário vê somente a entrega do próprio escritório'
);
select results_eq(
  $$select count(*)::bigint from public.casos$$,
  array[1::bigint],
  'usuário vê somente o próprio caso'
);
select results_eq(
  $$select cliente_final from public.casos$$,
  array['Cliente A'::text],
  'caso do outro escritório não vaza'
);
select results_eq(
  $$select count(*)::bigint from public.teses$$,
  array[0::bigint],
  'rascunhos jurídicos não são publicados'
);
select lives_ok(
  $$update public.usuarios set nome = 'Nome atualizado' where id = auth.uid()$$,
  'usuário pode atualizar somente seu nome pelas grants de coluna'
);

reset role;
update public.usuarios set papel='platform_admin'::public.usuario_papel where id='10000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select lives_ok($$select public.admin_atualizar_status_caso('40000000-0000-0000-0000-000000000004','producao'::public.caso_status)$$,'admin move caso cross-tenant');
reset role;
select results_eq($$select status::text from public.casos where id='40000000-0000-0000-0000-000000000004'$$,array['producao'::text],'status persistido');
set local role authenticated;
select lives_ok($$select public.admin_revisar_entrega('60000000-0000-0000-0000-000000000006','aprovado'::public.qa_status,'{"identificacao":true,"fatos":true,"fundamentacao":true,"pedidos":true,"citacoes":true,"campos_conferir":true}'::jsonb,'QA',true)$$,'admin entrega cross-tenant');
reset role;
select results_eq($$select status::text from public.casos where id='40000000-0000-0000-0000-000000000004'$$,array['entregue'::text],'entrega atômica');

select * from finish();
rollback;

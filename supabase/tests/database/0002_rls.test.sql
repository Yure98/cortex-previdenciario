begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

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

insert into public.casos (escritorio_id, cliente_final, beneficio, tipo_peca)
select escritorio_id, 'Cliente A', 'incapacidade', 'peticao'
from public.usuarios where id = '10000000-0000-0000-0000-000000000001';

insert into public.casos (escritorio_id, cliente_final, beneficio, tipo_peca)
select escritorio_id, 'Cliente B', 'rural', 'peticao'
from public.usuarios where id = '20000000-0000-0000-0000-000000000002';

insert into public.entregas (escritorio_id, caso_id, arquivo_path)
select escritorio_id, id, escritorio_id::text || '/' || id::text || '/entrega-a.docx'
from public.casos where cliente_final = 'Cliente A';

insert into public.entregas (escritorio_id, caso_id, arquivo_path)
select escritorio_id, id, escritorio_id::text || '/' || id::text || '/entrega-b.docx'
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

select * from finish();
rollback;

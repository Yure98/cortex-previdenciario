begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

select has_extension('vector', 'pgvector está habilitado');
select has_table('public', 'escritorios', 'tabela escritorios existe');
select has_table('public', 'usuarios', 'tabela usuarios existe');
select has_table('public', 'casos', 'tabela casos existe');
select has_table('public', 'documentos', 'tabela documentos existe');
select has_table('public', 'entregas', 'tabela entregas existe');
select has_table('public', 'teses', 'tabela teses existe');
select has_table('public', 'caso_teses', 'tabela caso_teses existe');
select has_table('public', 'uso_tokens', 'tabela uso_tokens existe');
select has_table('public', 'assinaturas', 'tabela assinaturas existe');
select has_table('public', 'faturas', 'tabela faturas existe');

select has_function(
  'public',
  'match_teses',
  array['vector', 'text', 'integer'],
  'função de busca semântica existe'
);
select has_function(
  'public',
  'reservar_uso_tokens',
  array['uuid', 'uuid', 'uuid', 'text', 'text', 'text', 'numeric', 'bigint', 'numeric', 'numeric'],
  'função atômica de reserva existe'
);

select results_eq(
  $$select count(*)::bigint from public.teses$$,
  array[11::bigint],
  'seed contém onze teses Tier 1'
);
select results_eq(
  $$select count(*)::bigint from public.teses where status = 'rascunho'$$,
  array[11::bigint],
  'todas as teses aguardam curadoria humana'
);
select results_eq(
  $$select count(*)::bigint from storage.buckets where id in ('cnis', 'timbrados', 'entregas') and not public$$,
  array[3::bigint],
  'os três buckets são privados'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'escritorios', 'usuarios', 'modelos_escritorio', 'casos', 'documentos',
        'entregas', 'auditoria', 'feedback', 'teses', 'jurisprudencia',
        'caso_teses', 'assinaturas', 'faturas', 'uso_tokens'
      )
      and c.relrowsecurity
  $$,
  array[14::bigint],
  'RLS está habilitado em todas as tabelas públicas'
);

select col_type_is('public', 'uso_tokens', 'custo_usd', 'numeric(18,10)', 'custo USD usa decimal');
select col_type_is('public', 'escritorios', 'franquia_pecas_mensal', 'integer', 'franquia usa inteiro');
select col_default_is('public', 'escritorios', 'franquia_pecas_mensal', '25', 'franquia padrão é 25');
select col_default_is('public', 'escritorios', 'valor_setup_centavos', '60000', 'setup padrão é R$ 600');
select col_default_is(
  'public',
  'escritorios',
  'dias_ate_primeira_mensalidade',
  '30',
  'primeira mensalidade começa após 30 dias'
);

select * from finish();
rollback;

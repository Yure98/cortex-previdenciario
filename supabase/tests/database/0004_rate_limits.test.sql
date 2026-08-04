begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select ok(
  (select permitido from public.consumir_rate_limit('teste', repeat('a', 64), 2, 60)),
  'primeira tentativa é permitida'
);
select is(
  (select restantes from public.consumir_rate_limit('teste', repeat('a', 64), 2, 60)),
  0,
  'segunda tentativa consome o saldo'
);
select is(
  (select permitido from public.consumir_rate_limit('teste', repeat('a', 64), 2, 60)),
  false,
  'tentativa acima do limite é negada'
);
select ok(
  (select tentar_novamente_em > 0 from public.consumir_rate_limit('teste', repeat('a', 64), 2, 60)),
  'negação informa retry-after positivo'
);
select results_eq(
  $$select chave_hash from public.rate_limit_buckets where escopo = 'teste'$$,
  array[repeat('a', 64)],
  'banco persiste somente hash hexadecimal'
);

update public.rate_limit_buckets
set janela_inicio = now() - interval '2 minutes'
where escopo = 'teste' and chave_hash = repeat('a', 64);
select ok(
  (select permitido from public.consumir_rate_limit('teste', repeat('a', 64), 2, 60)),
  'janela expirada reinicia o bucket'
);

select throws_ok(
  $$select * from public.consumir_rate_limit('teste', 'identificador-em-claro', 2, 60)$$,
  '22023',
  'RATE_LIMIT_INVALIDO',
  'função rejeita identificador não hasheado'
);

set local role authenticated;
select throws_ok(
  $$select * from public.rate_limit_buckets$$,
  '42501',
  null,
  'usuário autenticado não lê buckets internos'
);
select throws_ok(
  $$select * from public.consumir_rate_limit('teste', repeat('b', 64), 2, 60)$$,
  '42501',
  null,
  'usuário autenticado não executa o rate limiter'
);

select * from finish();
rollback;

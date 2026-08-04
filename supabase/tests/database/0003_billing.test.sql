begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('71000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@cortex.test','',now(),'{}','{"escritorio_nome":"Billing A"}',now(),now()),
('72000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-b@cortex.test','',now(),'{}','{"escritorio_nome":"Billing B"}',now(),now());

update public.escritorios set franquia_pecas_mensal=1 where id=(select escritorio_id from public.usuarios where id='71000000-0000-0000-0000-000000000001');
insert into public.faturas (id, escritorio_id, valor_centavos, tipo, status, asaas_payment_id, quantidade_pecas)
select '73000000-0000-0000-0000-000000000003', escritorio_id, 29000, 'addon', 'pendente', 'pay_addon_a', 10 from public.usuarios where id='71000000-0000-0000-0000-000000000001';
insert into public.faturas (id, escritorio_id, valor_centavos, tipo, status, asaas_payment_id)
select '74000000-0000-0000-0000-000000000004', escritorio_id, 39700, 'mensal', 'pendente', 'pay_month_b' from public.usuarios where id='72000000-0000-0000-0000-000000000002';

insert into public.casos(id,escritorio_id,cliente_final,beneficio,tipo_peca)
select '75000000-0000-0000-0000-000000000005',escritorio_id,'Caso anterior','rural','peticao' from public.usuarios where id='71000000-0000-0000-0000-000000000001';
insert into public.casos(id,escritorio_id,cliente_final,beneficio,tipo_peca)
select '76000000-0000-0000-0000-000000000006',escritorio_id,'Caso extra','rural','peticao' from public.usuarios where id='71000000-0000-0000-0000-000000000001';
insert into public.casos(id,escritorio_id,cliente_final,beneficio,tipo_peca)
select '77000000-0000-0000-0000-000000000007',escritorio_id,'Caso bloqueado','rural','peticao' from public.usuarios where id='72000000-0000-0000-0000-000000000002';
insert into public.geracoes(id,escritorio_id,caso_id,request_id,tipo_operacao,status)
select '78000000-0000-0000-0000-000000000008',escritorio_id,id,'88000000-0000-4000-8000-000000000008','peticao','concluida' from public.casos where id='75000000-0000-0000-0000-000000000005';
insert into public.geracoes(id,escritorio_id,caso_id,request_id,tipo_operacao)
select '79000000-0000-0000-0000-000000000009',escritorio_id,id,'89000000-0000-4000-8000-000000000009','peticao' from public.casos where id='76000000-0000-0000-0000-000000000006';
insert into public.geracoes(id,escritorio_id,caso_id,request_id,tipo_operacao)
select '7a000000-0000-0000-0000-00000000000a',escritorio_id,id,'8a000000-0000-4000-8000-00000000000a','peticao' from public.casos where id='77000000-0000-0000-0000-000000000007';
insert into public.consumos_peca(escritorio_id,caso_id,geracao_id,competencia,tipo,status)
select escritorio_id,caso_id,id,date_trunc('month',now())::date,'franquia','concluido' from public.geracoes where id='78000000-0000-0000-0000-000000000008';

select is(public.processar_evento_asaas('evt-addon-1','PAYMENT_CONFIRMED',repeat('a',64),'pay_addon_a','CONFIRMED',29000,null,current_date),'processado','confirma addon');
select is(public.processar_evento_asaas('evt-addon-1','PAYMENT_CONFIRMED',repeat('a',64),'pay_addon_a','CONFIRMED',29000,null,current_date),'duplicado','retry é idempotente');
select results_eq($$select count(*)::bigint from public.creditos_peca where fatura_id='73000000-0000-0000-0000-000000000003'$$,array[1::bigint],'um crédito para evento duplicado');
select is(public.autorizar_geracao_caso((select escritorio_id from public.usuarios where id='71000000-0000-0000-0000-000000000001'),'76000000-0000-0000-0000-000000000006','79000000-0000-0000-0000-000000000009')::text,'excedente','addon autoriza após franquia');
select results_eq($$select consumido from public.creditos_peca where fatura_id='73000000-0000-0000-0000-000000000003'$$,array[1],'reserva consome um crédito');
select is(public.processar_evento_asaas('evt-refund-1','PAYMENT_REFUNDED',repeat('b',64),'pay_addon_a','REFUNDED',29000,null,current_date),'processado','processa estorno');
select results_eq($$select quantidade-consumido from public.creditos_peca where fatura_id='73000000-0000-0000-0000-000000000003'$$,array[0],'estorno remove somente saldo não consumido');
select is(public.processar_evento_asaas('evt-overdue-1','PAYMENT_OVERDUE',repeat('c',64),'pay_month_b','OVERDUE',39700,null,current_date),'processado','processa inadimplência');
select results_eq($$select status::text from public.escritorios where id=(select escritorio_id from public.usuarios where id='72000000-0000-0000-0000-000000000002')$$,array['inadimplente'::text],'inadimplência bloqueia escritório');
select throws_ok($$select public.autorizar_geracao_caso((select escritorio_id from public.usuarios where id='72000000-0000-0000-0000-000000000002'),'77000000-0000-0000-0000-000000000007','7a000000-0000-0000-0000-00000000000a')$$,'P0001','INADIMPLENTE','geração falha fechada para inadimplente');

set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select results_eq($$select count(*)::bigint from public.creditos_peca$$,array[1::bigint],'usuário lê somente crédito próprio');
select results_eq($$select count(*)::bigint from public.faturas$$,array[1::bigint],'usuário não lê fatura de outro escritório');
select throws_ok($$insert into public.creditos_peca(escritorio_id,quantidade,fatura_id) select escritorio_id,1,'73000000-0000-0000-0000-000000000003' from public.usuarios limit 1$$,'42501',null,'navegador não escreve crédito');

select * from finish();
rollback;

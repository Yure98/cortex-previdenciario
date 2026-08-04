# Fase 7 — Runbook de deploy e observabilidade

Este documento separa o que é versionado no repositório do que exige decisão e acesso do
proprietário. Nenhum segredo deve ser enviado por chat, salvo em arquivo versionado ou reutilizado
entre Preview e Production.

## Decisões aprovadas

1. **Supabase:** projeto novo no plano Pro, região São Paulo (`sa-east-1`) se disponível e backup
   diário ativo. PITR será reavaliado antes do primeiro cliente pagante real.
2. **Vercel:** plano Pro, com Node.js 22 e `maxDuration = 300` em `/api/gerar`.
3. **Domínio:** exclusivamente `cortex.vertikaconsultoria.com.br`. O domínio raiz
   `vertikaconsultoria.com.br` hospeda outro site e não pode ser alterado, removido ou redirecionado.
4. **Alertas:** e-mail pelo Resend para o endereço próprio configurado em `OPS_ALERT_EMAIL`, sem
   endereço hardcoded.
5. **Uptime:** UptimeRobot no plano gratuito, depois que a URL final e o SSL estiverem ativos.

Continuam pendentes apenas os acessos/credenciais próprios das plataformas e a confirmação do nome
do projeto/time. Segredos não devem ser enviados pelo chat nem reutilizados entre ambientes.

## Supabase de produção

1. Criar um projeto separado de staging/CI, com senha gerada e armazenada em gerenciador de senhas.
2. Ativar MFA na conta administrativa.
3. Vincular localmente com `npx supabase link --project-ref <REF>` sem versionar arquivos de sessão.
4. Executar `npx supabase db diff --linked` e revisar o diff antes de qualquer escrita.
5. Aplicar as 15 migrations com `npx supabase db push`.
6. Confirmar no dashboard que `cnis`, `timbrados` e `entregas` possuem `public = false`.
7. Confirmar RLS habilitada em todas as tabelas listadas pelo teste
   `tests/unit/migrations-contract.test.ts`, inclusive `rate_limit_buckets`.
8. Confirmar o backup diário do plano Pro e registrar data/hora da primeira cópia recuperável. O
   PITR permanece um gate obrigatório antes do primeiro cliente pagante, conforme decisão do
   proprietário.
9. Em Authentication > Rate Limits, revisar limites nativos; configurar SMTP próprio e CAPTCHA
   antes de abrir cadastro público.

## Primeiro `platform_admin`

1. Criar a conta pelo cadastro normal e confirmar o e-mail.
2. No Supabase Studio, com MFA, localizar o UUID da conta em Authentication > Users.
3. Conferir nome e escritório vinculados antes da promoção.
4. Executar em transação, substituindo apenas o UUID:

```sql
begin;
select id, nome, escritorio_id, papel
from public.usuarios
where id = '<UUID_CONFIRMADO>'::uuid
for update;

update public.usuarios
set papel = 'platform_admin'::public.usuario_papel
where id = '<UUID_CONFIRMADO>'::uuid
  and papel = 'proprietario'::public.usuario_papel;

commit;
```

5. Encerrar e refazer a sessão; confirmar `/admin` e testar que uma segunda conta comum é
   redirecionada. Nunca promover por e-mail hardcoded ou formulário público.

## Vercel

1. Importar `Yure98/cortex-previdenciario` em um projeto **Vercel Pro** e selecionar Node.js `22.x`.
2. Cadastrar cada variável de `.env.example` separadamente em Preview e Production.
3. Na Fase 7, manter o Asaas em sandbox. A troca para produção pertence exclusivamente à Fase 10.
4. Não compartilhar entre ambientes: service role, chaves Anthropic/Voyage, Asaas, Resend,
   `INTERNAL_PYTHON_TOKEN` e `RATE_LIMIT_HASH_SECRET`.
5. Confirmar que `/api/gerar` usa `maxDuration = 300`, disponível no plano aprovado.
6. Confirmar o build e o passo `Client bundle secret scan` com zero vazamentos.
7. Validar `GET /api/python_health` sem autenticação e sem exposição de configuração interna.
8. Conferir nos logs que eventos críticos são JSON e não contêm corpo, e-mail, nome, CNIS, fatos,
   token ou signed URL.
9. Criar regra de rate limit na borda para `/api/webhooks/asaas`, antes da função, mantendo o token
   como segunda barreira. Validar o limite compatível com os reenvios do Asaas sandbox.

## Observabilidade e alertas

- O hook estável `instrumentation.ts` registra erros não tratados de rotas e Server Actions.
- `/api/gerar`, webhook Asaas e download emitem somente metadados permitidos.
- Cinco erros internos de geração em cinco minutos disparam um alerta, limitado a um por hora.
- O gasto global acima de 80% dispara um alerta por janela operacional.
- Falha do job `database` tenta enviar e-mail pelo Resend via GitHub Actions.
- Se `OPS_ALERT_EMAIL` não estiver configurado, o evento continua no log estruturado e o produto
  não falha.

## Uptime e SSL

Depois do domínio final:

1. Adicionar somente `cortex.vertikaconsultoria.com.br` ao projeto Vercel e copiar o registro do
   subdomínio exibido (normalmente CNAME; usar exatamente o valor informado pelo painel).
2. Aplicar na Hostinger somente o registro cujo host seja `cortex`. Não criar, editar ou excluir
   registros `@`, `www` ou qualquer outro registro do domínio raiz `vertikaconsultoria.com.br`.
3. Aguardar propagação e certificado SSL `Valid` na Vercel.
4. No UptimeRobot free, criar checks HTTPS para `/` e `/api/python_health`, a cada cinco minutos ou
   na menor frequência disponível no plano.
5. Direcionar os alertas do UptimeRobot ao mesmo endereço próprio aprovado.

## Smoke test manual com dois escritórios

- [ ] Escritório A: cadastro, confirmação, onboarding, timbrado e ativação.
- [ ] Escritório A: caso, duas perguntas, geração e atualização Realtime.
- [ ] `platform_admin`: acesso cross-tenant, movimentação, QA, aprovação e entrega.
- [ ] Escritório A: download autenticado; confirmar expiração da signed URL.
- [ ] Escritório B: nenhuma tela, API ou consulta revela dados do Escritório A.
- [ ] Logs do teste: zero CNIS, CPF, NIT, e-mail de cliente final, fatos ou signed URLs.

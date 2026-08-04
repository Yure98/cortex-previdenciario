# Relatório de aceite — Fase 7

## Estado

A preparação versionada de deploy, observabilidade e rate limiting está concluída na branch
`agent/phase7-deploy-observability`. As decisões externas foram aprovadas: Supabase Pro em São Paulo
com backup diário, Vercel Pro, subdomínio `cortex.vertikaconsultoria.com.br`, alertas por Resend e
UptimeRobot free. O aceite final permanece condicionado às operações externas, DNS/SSL e smoke test
com dois escritórios. Nenhuma credencial ou infraestrutura de produção foi presumida ou criada.

## Implementação versionada

- Node.js 22 fixado em `.nvmrc` e `package.json`.
- Hook estável do Next.js 15 para erros não tratados em rotas e Server Actions.
- Logger JSON com lista fechada de campos e sem serialização de request, resposta ou objeto de erro.
- Logs sanitizados em geração, webhook Asaas e download de entrega.
- Alerta por e-mail via Resend para taxa de erros de geração, gasto global acima de 80% e falha do
  job `database` da CI, usando destinatário configurado e não hardcoded.
- Rate limiting atômico em PostgreSQL, com chave HMAC-SHA256 e sem IP/e-mail em claro.
- Limites de autenticação por IP e e-mail, geração por escritório e webhook Asaas por IP.
- Contrato explícito de regra adicional na borda da Vercel para o webhook, bloqueando tráfego
  inválido antes da execução da função.
- Scanner pós-build contra vazamento dos valores reais de segredos no bundle cliente.
- Runbook de produção, promoção segura do primeiro `platform_admin`, backup, DNS, SSL, uptime e
  smoke test cross-tenant.

## Banco e isolamento

A migration `0015_phase7_observability_rate_limits.sql` cria `rate_limit_buckets`,
`consumir_rate_limit` e `gasto_global_mes_usd`. A tabela tem RLS, não possui policies para usuários
do produto e a função de consumo é concedida somente a `service_role`. O teste pgTAP
`0004_rate_limits.test.sql` contém nove asserções sobre atomicidade, reinício de janela, formato de
hash e bloqueio de `authenticated`.

## Evidência local

- ESLint: aprovado, zero warnings.
- TypeScript: aprovado.
- Vitest: 69/69.
- Python unittest: 3/3.
- Squawk: 15 migrations, zero ocorrências.
- Build de produção Next.js 15.5.22: aprovado, 23 rotas.
- Scanner de bundle cliente: zero vazamentos (sem secrets reais presentes no ambiente local).
- `npm audit --omit=dev`: mantém o advisory já documentado do `sharp` opcional trazido pelo Next.js;
  `images.unoptimized` permanece ativo e a aplicação não processa uploads por essa dependência.

Os nove testes pgTAP novos precisam ser executados pelo job `database` da PR. O total esperado passa
de 42 para 51 testes. O resultado remoto será registrado aqui depois da CI.

## Gates externos pendentes

1. Criar o projeto Supabase Pro na região São Paulo, aplicar migrations e confirmar backup diário.
2. Criar o projeto Vercel Pro e configurar variáveis separadas de Preview/Production.
3. Configurar `OPS_ALERT_EMAIL` e os segredos Resend na Vercel e no GitHub Actions.
4. Conferir RLS/buckets e promover o primeiro administrador por UUID e MFA.
5. Configurar a regra de borda do webhook Asaas.
6. Adicionar apenas o subdomínio `cortex`, aplicar somente seu CNAME na Hostinger e validar SSL,
   sem tocar no domínio raiz.
7. Criar os dois checks do UptimeRobot e executar o smoke test integral.

Somente após esses gates o critério de aceite do brief — URL final, SSL, backup, administrador,
observabilidade real, limites públicos e smoke test — pode ser marcado como concluído.

# Segurança

## Segredos e dados previdenciários

- Chaves ficam exclusivamente em variáveis de ambiente da Vercel.
- `SUPABASE_SERVICE_ROLE` é importada apenas em módulos `server-only`.
- CNIS, timbrados e entregas usam buckets privados; URLs assinadas têm vida curta.
- A função Python valida host, esquema, caminho do bucket, token interno e tamanho do PDF.
- O motor não registra prompts, fatos, URLs assinadas ou respostas jurídicas em logs.
- Voyage recebe apenas benefício e palavras-chave de vocabulário fechado. Dados do caso não
  existem no contrato público do cliente de embeddings.
- Toda chamada Anthropic/Voyage da geração exige reserva atômica e fecha uma linha de
  `uso_tokens` com contadores reais.

## Isolamento

Todas as tabelas do produto têm RLS. Tabelas internas do motor não oferecem policy de escrita
ao usuário. A API resolve `escritorio_id` pela sessão e só então usa service role para executar
operações administrativas daquele tenant.

## Baseline Next.js 15

O projeto foi migrado para Next.js `15.5.22` e React `19.2.8` antes da implementação do
portal autenticado da Fase 4. A migração incluiu as APIs assíncronas de request do App Router
e a revalidação integral do motor e da entrega DOCX.

As seguintes medidas de redução de superfície permanecem:

- `next/image` sem otimizador;
- nenhuma rewrite, middleware/proxy, i18n, WebSocket ou servidor customizado;
- nenhum Server Action e corpo configurado para no máximo 1 MB caso um seja introduzido;
- homepage pré-renderizada estaticamente;
- `/api/gerar` roda em Node, limita corpo a 16 KB e sempre responde `Cache-Control: no-store`;
- nenhuma entrada não confiável em `beforeInteractive` ou nonce CSP.

Atualizações de patch da major 15 devem ser avaliadas regularmente e sempre acompanhadas de
lint, typecheck, testes, build, auditoria e pgTAP antes de chegar à produção.

### Dependência opcional de imagens

O Next.js `15.5.22` instala `sharp@0.34.5` como dependência opcional. A auditoria atual sinaliza
advisories herdados do libvips sem versão corrigida disponível. O projeto mantém
`images.unoptimized: true`, não utiliza a rota de otimização do `next/image` e não envia imagens
de usuário ao `sharp`. O advisory deve continuar monitorado e a dependência deve ser atualizada
assim que o Next.js 15 publicar uma versão compatível corrigida.

## Relato

Não inclua CPF, NIT, CNIS, chaves ou URLs assinadas em issues. Envie relatos de segurança por
canal privado ao proprietário do repositório.

## Observabilidade e limitação de taxa

- Logs operacionais usam uma lista fechada de metadados técnicos. Corpo de requisição, e-mail,
  telefone, CNIS, fatos, prompts, conteúdo jurídico, tokens e URLs assinadas não fazem parte do
  tipo aceito pelo logger.
- Chaves do rate limiter são HMAC-SHA256 calculados exclusivamente no servidor com
  `RATE_LIMIT_HASH_SECRET`; IP e e-mail em claro não são persistidos.
- A tabela `rate_limit_buckets` tem RLS e não concede leitura nem execução a `anon` ou
  `authenticated`. Somente `service_role` chama a função atômica.
- Login, cadastro, recuperação, geração e webhook Asaas têm limites na aplicação. O webhook deve
  receber também uma regra de rate limit na borda da Vercel antes do go-live, para bloquear tráfego
  inválido antes de alocar uma função.
- O hook `instrumentation.ts` registra erros não tratados sem serializar o objeto de erro ou a
  requisição. Alertas enviados pelo Resend recebem somente o mesmo conjunto reduzido de
  identificadores; o destinatário vem de `OPS_ALERT_EMAIL`, nunca do código.
- O pós-build procura os valores reais dos segredos configurados em `.next/static`; o build falha
  se encontrar qualquer um deles no bundle cliente.

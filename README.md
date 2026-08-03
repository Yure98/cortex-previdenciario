# Córtex Previdenciário

SaaS self-service para gerar peças previdenciárias em `.docx` no timbrado do escritório.

Este repositório está na **Fase 1**: scaffold Next.js 14, schema Supabase, pgvector,
RLS por escritório, Storage privado, contratos de custo e base do design system.
O motor de IA ainda não foi implementado.

## Stack

- Next.js 14, App Router e TypeScript
- Supabase Postgres, Auth, Storage, Realtime, RLS e pgvector
- Funções Python na Vercel para o futuro `diagnostico.py` e `python-docx`
- Anthropic, Voyage, Asaas e Resend nas fases seguintes
- Cal Sans para display; Inter para corpo/UI; JetBrains Mono para código

## Requisitos

- Node.js 20+
- npm
- Git com suporte a submódulos
- Docker Desktop para executar o Supabase local
- Projeto Supabase para ambiente remoto

## Instalação local

```bash
git clone --recurse-submodules <URL_DO_REPOSITORIO>
cd cortex-previdenciario
npm ci
cp .env.example .env.local
npx supabase start
npm run db:reset
npm run dev
```

Para uma cópia já clonada sem submódulos:

```bash
git submodule update --init --recursive
```

O app Next estará em `http://localhost:3000`. Para testar também a função Python da
Vercel no mesmo projeto, use `vercel dev` depois de instalar/autenticar a CLI da Vercel.

## Variáveis de ambiente

Copie `.env.example`. Nunca commit chaves reais.

Variáveis obrigatórias do produto:

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `MODELO_SONNET`, `MODELO_HAIKU`
- `LIMITE_GASTO_MENSAL_USD`
- `VOYAGE_API_KEY`, `MODELO_EMBEDDING=voyage-4`
- `COTACAO_USD_BRL`, `LIMITE_CUSTO_PECA_BRL=3.00`

A service role do Supabase é usada apenas no servidor. A anon key é pública por natureza,
mas toda leitura continua limitada por RLS.

## Banco e migrations

As migrations ficam em `supabase/migrations` e rodam em ordem:

1. extensões e enums;
2. escritórios, usuários e modelos privados;
3. casos, documentos, entregas, auditoria e feedback;
4. teses, jurisprudência e RAG com `vector(1024)`;
5. assinaturas, faturas e `uso_tokens`;
6. triggers e reserva atômica de custo;
7. grants e RLS;
8. buckets privados;
9. Realtime de casos/entregas;
10. catálogo das 11 teses Tier 1 em rascunho.

Execute:

```bash
npm run db:reset
npm run sql:lint
npm run test:sql
```

Os testes pgTAP criam dois escritórios e comprovam que um usuário não lê o caso do outro.

## Segurança multi-tenant

- Toda tabela com dados de cliente carrega `escritorio_id`.
- Relações sensíveis usam foreign keys compostas `(id, escritorio_id)`.
- O navegador não recebe permissão para alterar papel, plano, cobrança, status, teto ou uso.
- O painel administrativo futuramente usará service role somente depois de validar
  `platform_admin` no servidor.
- Caminhos de Storage começam com o UUID do escritório.
- `entregas` não possui policy de download para o cliente. O backend emitirá signed URL curta.
- Os buckets `cnis`, `timbrados` e `entregas` têm `public = false`.

## Guardrail LGPD do RAG

Conteúdo público das teses pode ser enviado ao Voyage para embedding. Dados do caso não.

O único contrato permitido para consultas de caso é
`createDeidentifiedRagQuery`, em `lib/rag/deidentified-query.ts`. Ele aceita somente:

- uma categoria de benefício fechada;
- até oito palavras-chave de vocabulário jurídico controlado.

Não existe campo de texto livre nessa interface. CPF, CNIS, NIT/PIS, nome, e-mail, telefone,
fatos e documentos não podem compor a requisição ao provedor de embeddings.

## Biblioteca jurídica

As 11 teses Tier 1 estão em `status = rascunho`. As fichas anexadas com `[CONFERIR]`
foram preservadas e não são publicadas antes da revisão humana.

Novas teses não exigem migration. Prepare um JSON e execute:

```bash
npm run teses:importar -- caminho/teses.json
```

O importador sempre força rascunho, remove embeddings recebidos e marca curadoria pendente.

## Custos e regras comerciais

- Setup único: R$ 600,00 — criado como fatura na Fase 6.
- Assinatura: R$ 397,00/mês, iniciando após 30 dias.
- Franquia: 25 peças/mês.
- Excedente: R$ 29,00 por peça.
- Meta técnica: custo de IA inferior a R$ 3,00 por peça.

`reservar_uso_tokens` usa lock transacional e contabiliza reservas pendentes antes de liberar
uma chamada. A Fase 2 ligará esse contrato ao Haiku/Sonnet e registrará input, output,
cache read, cache creation e custos finais em `uso_tokens`.

## Validação

```bash
npm run check
```

O comando executa lint, typecheck, testes unitários, compilação Python e build Next.js.

## Supabase remoto

1. Crie o projeto no Supabase.
2. Vincule a CLI com `npx supabase link --project-ref <REF>`.
3. Revise o diff com `npx supabase db diff --linked`.
4. Aplique com `npx supabase db push`.
5. Confirme no dashboard que os três buckets continuam privados.
6. Cadastre o primeiro usuário e promova seu papel para `platform_admin` por operação
   administrativa autenticada; nunca por e-mail hardcoded no código.

## Asaas e Resend

As integrações funcionais entram na Fase 6 e na entrega administrativa. Para preparar os
ambientes, use o sandbox do Asaas, configure um token de autenticação do webhook e verifique
o domínio remetente no Resend. O webhook nunca confiará apenas no corpo recebido.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Configure todas as variáveis de `.env.example` separadamente para Preview e Production.
3. Use Node.js 20 ou superior.
4. Execute o build padrão `npm run build`.
5. Valide `/api/python_health` para confirmar o runtime Python.
6. Não exponha `SUPABASE_SERVICE_ROLE`, chaves Anthropic/Voyage ou tokens Asaas ao browser.

## DNS na Hostinger

Depois que a Vercel informar o destino do domínio:

1. adicione o domínio ao projeto Vercel;
2. na zona DNS da Hostinger, crie exatamente os registros A/CNAME solicitados pela Vercel;
3. remova registros conflitantes somente após confirmar o alvo correto;
4. aguarde a propagação e confirme SSL ativo no painel da Vercel.

## Skills jurídicas

`packages/cortex-agentes` é um submódulo apontando para
`github.com/Yure98/cortex-agentes`, branch `main`. O envelope SaaS pode criar adaptadores,
mas não altera prompts, referências, assets ou o método jurídico desse repositório.

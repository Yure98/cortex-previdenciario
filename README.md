# Córtex Previdenciário

SaaS self-service para gerar peças previdenciárias em `.docx` no timbrado do escritório.

As **Fases 1 a 5 estão concluídas** e a Fase 6 está implementada para validação em sandbox: infraestrutura multi-tenant, motor de IA em três
camadas, RAG com guardrail LGPD, geração DOCX tradicional/Visual Law e entrega privada por
signed URL, além do portal autenticado do advogado, estão implementados e validados. O baseline
foi migrado para Next.js 15 antes da superfície de autenticação. A Fase 5 adiciona o painel
administrativo, a fila Kanban e o gate humano de QA. A Fase 6 integra cobrança Asaas idempotente,
reconciliação administrativa e seis notificações transacionais pelo Resend.

## Stack

- Next.js 15.5.22, App Router, React 19 e TypeScript
- Supabase Postgres, Auth, Storage, Realtime, RLS e pgvector
- Função Python interna na Vercel para diagnóstico estrutural do CNIS
- Anthropic Messages SDK com Haiku/Sonnet e prompt caching explícito
- Voyage `voyage-4` com embeddings de 1.024 dimensões
- Asaas sandbox para setup, assinatura e peças extras; Resend para notificações sem dados sensíveis
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
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
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
- `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `ASAAS_ENVIRONMENT=sandbox`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `MODELO_SONNET`, `MODELO_HAIKU`
- `LIMITE_GASTO_MENSAL_USD`
- `VOYAGE_API_KEY`, `MODELO_EMBEDDING=voyage-4`
- `COTACAO_USD_BRL`, `LIMITE_CUSTO_PECA_BRL=3.00`
- `ENTREGA_SIGNED_URL_TTL_SECONDS=300` (aceita de 60 a 900 segundos)
- `INTERNAL_PYTHON_TOKEN` (mínimo de 32 caracteres) e `PYTHON_DIAGNOSTICO_URL`
- preços por MTok de Sonnet, Haiku e Voyage listados no `.env.example`

Os preços são configuração operacional, não segredo. Revise-os ao trocar modelos ou quando o
provedor alterar tarifas. A reserva usa o pior caso de cache write e saída máxima; o fechamento
usa os contadores reais devolvidos pelos provedores.

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
10. catálogo das 11 teses Tier 1 em rascunho;
11. execuções do motor, consumo de peças, locks comerciais e conclusão/falha atômicas.
12. metadados DOCX, hash/preflight e conclusão transacional da entrega;
13. autorização administrativa, QA e entrega auditada.
14. customer/pagamentos Asaas, eventos idempotentes, créditos de peças e RLS de cobrança.

Execute:

```bash
npm run db:reset
npm run sql:lint
npm run test:sql
```

Os testes pgTAP criam escritórios isolados e comprovam que um usuário não lê casos, entregas,
faturas nem créditos de outro tenant.

## Segurança multi-tenant

- Toda tabela com dados de cliente carrega `escritorio_id`.
- Relações sensíveis usam foreign keys compostas `(id, escritorio_id)`.
- O navegador não recebe permissão para alterar papel, plano, cobrança, status, teto ou uso.
- O painel administrativo usa service role somente depois de validar `platform_admin` no
  servidor; mutações de QA repetem a validação no PostgreSQL.
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
cada chamada Anthropic ou Voyage. O fechamento registra input, output, cache read, cache
creation, custo USD, cotação e custo BRL em `uso_tokens`.

`autorizar_geracao_caso` usa outro lock por escritório/competência. Ele bloqueia escritório
suspenso/inadimplente/cancelado, fatura vencida e excedente sem addon pago. As primeiras 25
peças do mês usam a franquia; a 26ª em diante só reserva consumo quando existe unidade paga.

## Motor da Fase 2

`POST /api/gerar` aceita:

```json
{
  "caso_id": "uuid",
  "escritorio_id": "uuid-opcional-para-validacao",
  "tipo_operacao": "peticao"
}
```

Envie opcionalmente `Idempotency-Key: <uuid>`. O backend nunca confia no `escritorio_id` do
corpo: resolve o tenant pela sessão Supabase, carrega o caso pelo tenant e usa service role só
depois dessa validação.

Fluxo implementado:

1. pré-checagem de teto global, do escritório e da peça;
2. lock comercial de franquia/excedente/inadimplência;
3. signed URL de 90 segundos para o CNIS privado;
4. Python extrai períodos, remunerações e indicadores e calcula dias sem sobreposição;
5. Haiku classifica o caso em benefício e vocabulário RAG fechado;
6. Voyage recebe exclusivamente `benefício + palavras-chave` de-identificados;
7. pgvector recupera de uma a três teses ativas;
8. Sonnet analisa, redige e revisa; se reprovar, corrige e executa o segundo e último ciclo;
9. o gerador Node cria a peça tradicional ou Visual Law, preservando o timbrado por patch
   OOXML ou usando um fallback limpo;
10. a entrega é validada, enviada ao bucket privado e registrada junto da conclusão da
    geração; a resposta contém uma signed URL curta e nunca uma URL pública.

Os prompts jurídicos são lidos literalmente do submódulo `cortex-agentes`. O bloco estático
de skill/referências recebe `cache_control: { type: "ephemeral" }`; o caso fica em bloco
dinâmico separado e não cacheado. O motor não imprime conteúdo do caso nem URLs assinadas.

A resposta não expõe o texto integral. Ela devolve metadados de QA/custo, nome sanitizado,
signed URL, expiração, indicação de uso do timbrado e advertências do preflight. Repetir uma
requisição concluída com a mesma chave de idempotência emite uma nova signed URL curta.

## DOCX e timbrado — Fase 3

A estratégia é híbrida e inteiramente Node:

- `docx` cria os blocos da peça e o documento de fallback;
- JSZip aplica um patch OOXML no parágrafo `{{CONTEUDO_PETICAO}}`;
- header, footer, logo, marca-d'água, margens e demais parts do timbrado são preservados;
- o preflight aceita marcador dividido entre runs, normaliza separadores ZIP e medidas OOXML
  inválidas em uma cópia de trabalho e nunca sobrescreve o upload original;
- macros, ActiveX, embeddings, path traversal, marcadores ambíguos e pacotes acima dos limites
  são rejeitados antes de franquia ou gasto de tokens.

O nome final segue `peticao_[cliente_sanitizado]_[AAAA-MM-DD].docx`. O objeto fica em
`entregas/{escritorio}/{caso}/{geracao}/{arquivo}`; a URL assinada não é persistida.

O formato Visual Law acrescenta sumário executivo, quadro visual, linha do tempo contributiva,
tabela de provas/pendências e alertas, sem alterar o método jurídico das skills. Campos
`[CONFERIR]` permanecem destacados e a revisão humana é obrigatória.

Para reproduzir a matriz de QA com conteúdo sintético:

```bash
npm run docx:qa -- caminho/timbrado.docx caminho/saida
```

Templates com variantes de cabeçalho recebem o aviso
`CABECALHO_COM_VARIANTES_REVISAR_PREVIEW`. No onboarding, o escritório é orientado
a revisar possível sobreposição; o produto não redesenha automaticamente o timbrado.

## Portal do advogado — Fase 4

- cadastro, login, logout, confirmação por e-mail e recuperação de senha via Supabase Auth;
- middleware renova a sessão e protege todas as rotas `/portal`;
- onboarding curto em três etapas para dados do escritório, cores, NotebookLM opcional e
  timbrado DOCX, com progresso de upload e preflight antes de ativar o escritório;
- criação de caso em três etapas com CNIS PDF, fatos, pedidos, opção de jurisprudência e formato
  tradicional/Visual Law;
- dashboard, lista de casos com atualização Realtime e detalhe com teses, requisitos e provas;
- `[CONFERIR]` destacado em amarelo e alerta permanente de revisão profissional;
- plano e uso exibem franquia mensal, saldo, excedentes pagos e histórico de faturas;
- download passa por autorização do tenant no servidor e redireciona para signed URL de curta
  duração; nenhum bucket foi tornado público.

Uploads autenticados validam origem, limite de 50 MB, extensão, MIME e assinatura binária. O
navegador não envia `escritorio_id`: o tenant é sempre resolvido pela sessão e confirmado antes
de qualquer uso da service role.

## Diagnóstico determinístico do CNIS

`api/diagnostico.py` é uma função interna protegida por token. Ela só baixa URLs assinadas do
host Supabase configurado e do caminho `cnis`, limita o PDF a 12 MB e nunca registra corpo ou
URL. CPF, NIT, nome e texto bruto são descartados da saída. PDFs escaneados sem camada de texto
retornam `CNIS_INVALIDO`; OCR não foi presumido nem adicionado ao escopo.

O cálculo é deliberadamente estrutural: união de intervalos, dias inclusivos, corte em
13/11/2019, concomitâncias, lacunas e competências encontradas. Decisão jurídica e campos
ausentes permanecem nas skills e são sinalizados para confirmação humana.

## Indexação e ativação das teses

Para gerar embeddings do conteúdo público das 11 teses:

```bash
npm run teses:embeddings
```

O script envia apenas a ficha pública ao Voyage e grava `vector(1024)`. Ele não ativa teses.
`match_teses` continua aceitando somente `status = ativa`; portanto, uma ficha com
`[CONFERIR]` deve passar por curadoria humana antes da ativação. Se nenhuma tese ativa existir
para a categoria, o motor falha fechado com `RAG_SEM_TESES_ATIVAS`, sem improvisar fundamento.

Setup, carência, franquia e excedente ficam em colunas protegidas de `escritorios`; clientes
não recebem `GRANT` para modificar esses valores pelo navegador.

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
5. Valide `/api/python_health` e a função interna `/api/diagnostico`.
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

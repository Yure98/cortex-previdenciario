# Instruções para o Codex - Córtex Previdenciário

Leia junto com `BRIEF-CODEX.md` (spec completa). Este arquivo diz O QUE fazer, EM QUE ORDEM e o FORMATO DE SAÍDA.

## Tarefa
Construir a plataforma SaaS self-service que entrega peças previdenciárias no `.docx` do escritório. Não alterar o método jurídico (vem das skills do repo `cortex-agentes` + biblioteca de teses). Você constrói o envelope: motor, banco, portal, admin, pagamentos.

## Ordem de construção (não pule)
1. **Repo + infra:** Next.js 14 (App Router, TS) + Supabase. Migrations SQL das tabelas (seção 4 do brief) + `teses` com pgvector (seção 11) + RLS por escritório.
2. **Motor** (`/api/gerar`): 3 camadas de custo - código (parsing CNIS + cálculo via `diagnostico.py` como microserviço) → Haiku (classificação/triagem) → Sonnet (redação/análise/revisão). **Prompt caching obrigatório** nos blocos estáticos. **Teto de gasto** checado antes de cada geração (aborta se estourar). Registrar tudo em `uso_tokens`. RAG: buscar 1-3 teses por embedding e injetar só elas.
3. **Geração .docx:** preencher `{{CONTEUDO_PETICAO}}` do timbrado preservando header/footer/logo/margens; montar Visual Law dentro do .docx quando pedido; .docx limpo se sem timbrado.
4. **Portal do advogado:** auth, onboarding (upload timbrado/cores/modelos privados), novo caso (upload CNIS + form + 2 perguntas), status, download.
5. **Admin (só Yure):** dashboard (MRR, gasto vs teto), fila Kanban, QA, escritórios, financeiro.
6. **Asaas:** setup R$600 (uma vez) + assinatura R$397/mês (após 30 dias) + excedente; webhooks; bloquear geração se inadimplente ou teto atingido.

## UX das teses (deixar "legal" pro usuário)
- No portal, cada tese aplicada aparece como **card interativo**: `resumo` em destaque, `requisitos` e `provas_necessarias` como **checklists**, base legal e jurisprudência recolhíveis. `[CONFERIR]` sempre destacado em amarelo.
- Onboarding e criação de caso em **passos curtos** (wizard), não formulário gigante. Upload com barra de progresso. Estado de "gerando" com feedback.

## Design (obrigatório)
Seguir `design-tokens.md` (Cal.com): canvas branco, primário `#111111`, cards `#f5f5f5`, footer `#101010`, Inter + Cal Sans. Botão primário preto, raio 8px. Muito whitespace.

## Formato de saída (o que você me entrega)
1. **Repo no GitHub (Yure98)**, deployável na Vercel, sem erro de build.
2. **Estrutura:** `/app` (portal + admin), `/api` (motor), `/lib` (supabase, anthropic, asaas, docx), `/supabase/migrations` (SQL + RLS + pgvector), `/scripts` (diagnostico.py como microserviço ou lib), `/components` (design system).
3. **`.env.example`** com: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE, ASAAS_API_KEY, RESEND_API_KEY, MODELO_SONNET, MODELO_HAIKU, LIMITE_GASTO_MENSAL_USD.
4. **README** com setup passo a passo (Supabase, Asaas, Vercel, DNS Hostinger) e como rodar local.
5. **Saída do produto = arquivo `.docx`** salvo no bucket `entregas` (nunca público; download por signed URL). Nome sanitizado `peticao_[cliente]_[data].docx`.
6. **Sem segredo hardcoded. RLS ativo. Buckets privados. `uso_tokens` gravado a cada chamada.**

## Critério de aceite (MVP)
Advogado faz onboarding (sobe timbrado) → cria caso com CNIS → motor gera o `.docx` no timbrado dele, usando caching, respeitando o teto de gasto e o RAG de teses → aparece no admin pra QA → é entregue no portal. Assinatura Asaas ativa. Custo por peça registrado e < R$3.

## Fora de escopo agora
App mobile, multiusuário avançado, as teses além das 11 do Tier 1 (a biblioteca cresce depois; arquitetura já pronta pra plugar).

# Fases 7 a 10 — Deploy, Curadoria, Hardening e Go-Live

Brief de execução. Segue as mesmas fontes da verdade das fases anteriores (`docs/brief-original.md`,
`docs/instrucoes-originais.md`, `docs/design-tokens.md`, todos versionados neste repositório). Não
alterar o método jurídico do submódulo `cortex-agentes`. Cada fase é uma PR separada, com CI verde
(`validate` + `database`) antes do merge — mesmo padrão das Fases 1 a 6.

**Estas são as ÚLTIMAS 4 fases planejadas.** Depois da Fase 10, o produto está pronto para o primeiro
cliente pagante real. Não inventar Fase 11+ sem um brief novo.

---

# FASE 7 — Deploy real e observabilidade

## Objetivo
Sair do "roda na CI e no sandbox" para "roda em produção, e alguém percebe quando quebra".

## 7.1 Deploy Vercel

- Importar o repositório na Vercel (produção).
- Configurar TODAS as variáveis de `.env.example` separadamente em **Preview** e **Production**
  (nunca reaproveitar chave de sandbox em produção).
- Node.js 22+ (confirmar compatibilidade com a versão fixada no `.nvmrc`).
- Validar `/api/python_health` após deploy — confirma que o runtime Python da Vercel está ativo.
- Confirmar que `SUPABASE_SERVICE_ROLE`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `ASAAS_API_KEY`,
  `RESEND_API_KEY` **nunca** aparecem em resposta HTTP, log ou bundle client-side (checar
  `next build` output + inspecionar bundle do client por regex das chaves).

## 7.2 Supabase remoto (produção)

- Criar o projeto Supabase de produção (separado do que já existe para staging/CI).
- `npx supabase link --project-ref <REF>` e `npx supabase db push` — aplicar as 14 migrations.
- Confirmar no dashboard: os três buckets (`cnis`, `timbrados`, `entregas`) continuam `public = false`.
- Confirmar RLS habilitada em todas as tabelas de produto (não é o default do Supabase — checar
  manualmente, é o tipo de coisa que um `db push` mal comparado pode deixar passar).
- Ativar **Point-in-Time Recovery** (ou o backup diário mínimo do plano contratado). Sem isso, um
  erro de operação apaga dado de cliente sem volta.

## 7.3 DNS na Hostinger

- Vercel informa o(s) registro(s) A/CNAME necessários.
- Criar exatamente esses registros na zona DNS da Hostinger.
- Remover registros conflitantes **somente depois** de confirmar o alvo correto.
- Aguardar propagação e confirmar certificado SSL ativo no painel da Vercel antes de anunciar a URL
  a qualquer pessoa.

## 7.4 Primeiro platform_admin

- Documentar (README) o procedimento: criar o usuário normalmente pelo cadastro, depois promover o
  papel para `platform_admin` **diretamente no banco de produção**, por uma operação administrativa
  autenticada (SQL direto via Supabase Studio com MFA, ou script one-off).
- **Nunca** por e-mail hardcoded no código, nunca por formulário público. Isso já é regra desde a
  Fase 5 — aqui é só a execução real, uma vez.

## 7.5 Observabilidade (não existia em nenhuma fase anterior)

- Error tracking em produção (Sentry ou equivalente) para `app/api/**` e Server Actions. Captura
  erro com `caso_id`/`escritorio_id` quando disponível — **nunca** captura CNIS, fatos do caso, ou
  conteúdo de e-mail/telefone do cliente final no payload do erro.
- Log estruturado (JSON) nas rotas críticas (`/api/gerar`, `/api/webhooks/asaas`, download de
  entrega), sem logar corpo de requisição sensível — mesmo princípio já aplicado à signed URL
  (nunca logada) desde a Fase 3.
- Alerta simples (e-mail ou webhook para você) quando: `database` job da CI falhar, taxa de erro do
  `/api/gerar` passar de um limiar, ou o teto global de gasto passar de 80%.
- Uptime check externo (ex: um serviço gratuito de ping) na home e em `/api/python_health`.

## 7.6 Rate limiting (gap real, nunca implementado)

Nenhuma fase anterior implementou limite de taxa. Isso é uma lacuna de produção, não um "nice to
have":

- `/entrar` e fluxo de recuperação de senha: limitar tentativas por IP/e-mail (o Supabase Auth já
  tem alguma proteção nativa — confirmar quais limites vêm de fábrica e reforçar se necessário).
- `/api/gerar`: já protegido por idempotência e regras comerciais, mas adicionar limite básico por
  escritório (ex: N requisições/minuto) contra loop de cliente com bug.
- `/api/webhooks/asaas`: o Asaas já controla o reenvio, mas validar que um IP arbitrário não consegue
  martelar a rota (o token já impede efeito, mas ainda consome CPU validando — limitar por IP).

## 7.7 Smoke test manual (checklist, não script)

Com dois escritórios de teste reais no ambiente de produção:
1. Cadastro → onboarding → upload de timbrado → ativação.
2. Criar caso → responder as duas perguntas obrigatórias → gerar → acompanhar status via Realtime.
3. Login como `platform_admin` → ver o caso do outro escritório na fila → mover status → aplicar QA
   → aprovar → confirmar entrega.
4. Download da entrega pelo advogado (link autenticado, signed URL expira).
5. Confirmar que o Escritório B **não** consegue ver nada do Escritório A em nenhuma tela.

## Critério de aceite — Fase 7
Produto acessível pela URL final, com SSL, banco de produção com backup ativo, `platform_admin`
promovido, observabilidade mínima capturando erro sem vazar dado sensível, rate limit nas rotas
públicas, e os 5 passos do smoke test executados manualmente com sucesso.

---

# FASE 8 — Ferramenta de curadoria de teses

## Objetivo
O motor falha fechado (`RAG_SEM_TESES_ATIVAS`) até as teses serem revisadas por humano e ativadas.
Hoje isso só é possível via JSON + script (`scripts/importar-teses.ts`) + SQL direto. Esta fase
constrói a ferramenta para eu (e um previdenciarista parceiro) revisar e ativar teses sem precisar
de acesso a banco. **Esta fase NÃO inclui escrever conteúdo jurídico — isso continua sendo trabalho
humano meu/do previdenciarista, feito através da ferramenta que esta fase constrói.**

## 8.1 Rota administrativa `/admin/teses`

- Lista todas as teses com filtro por `status` (`rascunho` / `ativa`) e por categoria de benefício.
- Indicador visual de quantas fichas ainda têm marcador `[CONFERIR]` pendente.
- Busca por slug/título.

## 8.2 Detalhe e edição — `/admin/teses/[slug]`

- Exibir todos os campos da ficha (conforme `references/*.md` do submódulo `cortex-agentes` e o
  gabarito usado na Fase 1): resumo, requisitos, base legal, jurisprudência-chave, provas
  necessárias, estratégia, modelo de redação, erros comuns.
- Edição inline de cada campo, com **preservação obrigatória** dos marcadores `[CONFERIR: ...]` —
  a interface não deve permitir salvar um campo que remova o marcador sem que o texto ao redor
  também tenha sido revisado (checkbox explícito "revisei este marcador" por ocorrência, não
  remoção silenciosa).
- Histórico de revisão: quem editou, quando (aproveitar o padrão de auditoria já existente).

## 8.3 Ativação

- Botão "Ativar tese" **só habilitado quando**: zero marcadores `[CONFERIR]` pendentes sem
  confirmação explícita, todos os campos obrigatórios preenchidos.
- Ao ativar: dispara a geração do embedding via Voyage (reaproveitar
  `scripts/gerar-embeddings-teses.ts` como função chamável, não just CLI) e muda `status` para
  `ativa` numa transação — se o embedding falhar, a tese **não** é ativada (sem estado parcial).
- Registrar em `auditoria`: quem ativou, quando.
- Ação de "Desativar" simétrica, para o caso de uma tese precisar de correção após já estar em uso
  (não deleta, só remove de circulação — `caso_teses` já vinculados no passado permanecem intactos
  para histórico).

## 8.4 Importação em lote (mantém e conecta o que já existe)

- A UI ganha uma tela de upload de JSON que chama o mesmo caminho de `importar-teses.ts` (sempre
  força `rascunho`, sempre remove embedding recebido, sempre marca curadoria pendente — regra que
  já existe, não mudar).

## Banco de dados
Nenhuma migration nova provavelmente necessária além de, se preciso, uma coluna de controle de
`[CONFERIR]` resolvidos por campo em `teses` (ex: `campos_confirmados jsonb`). Avaliar e propor
antes de implementar — não migrar sem necessidade real.

## Critério de aceite — Fase 8
Consigo abrir `/admin/teses`, editar uma ficha, resolver os `[CONFERIR]` marcando cada um, e ativar
a tese — sem tocar em SQL ou terminal. A tese ativada aparece imediatamente disponível para o RAG.

---

# FASE 9 — Validação real e hardening pré-lançamento

## Objetivo
Provar com dados reais (não mock, não sandbox de teste) que o produto funciona e é seguro antes do
primeiro cliente pagante de verdade.

## 9.1 E2E real controlado

- Com pelo menos 1 tese do Tier 1 ativada (depende da Fase 8 + curadoria mínima ter acontecido),
  rodar o pipeline completo com `ANTHROPIC_API_KEY` e `VOYAGE_API_KEY` **reais**, não mock:
  CNIS de teste → diagnóstico → Haiku → RAG → Sonnet → `.docx` no timbrado → entrega.
- Medir e registrar o **custo real por peça** (USD e BRL) contra a meta de R$ 3,00. Se estourar,
  reportar antes de qualquer ajuste — não corrigir tarifa/modelo sem aprovação.
- Repetir para o formato Visual Law e para o fallback sem timbrado.
- Abrir o `.docx` final no Microsoft Word desktop (pendência que se arrasta desde a Fase 3 — os
  testes até aqui usaram LibreOffice/python-docx como proxy, nunca o consumidor real de destino).

## 9.2 Segurança — segunda passada

- Rodar `npm audit` e resolver o que tiver correção disponível sem `--force` automático; documentar
  o que ficar pendente (ex: `sharp/libvips`, já mitigado) em `SECURITY.md`.
- Revisar CSRF/same-origin em todas as rotas de mutação (auth, onboarding, casos, admin, webhook) —
  confirmar que a proteção já implementada nas fases anteriores cobre as rotas novas da Fase 6/8.
- Auditoria de log: grep manual nos logs de produção (após o smoke test da Fase 7) por qualquer
  ocorrência de CPF, e-mail de cliente final, ou trecho de fato do caso. Deve dar zero.
- Confirmar que nenhuma variável `NEXT_PUBLIC_*` expõe algo além da anon key e URL pública do
  Supabase.

## 9.3 Compliance e páginas legais

- Termos de Uso e Política de Privacidade (LGPD) — páginas estáticas, linkadas no cadastro.
- Aviso de "minuta assistida por IA, revisão profissional obrigatória" já existe no produto da
  peça — confirmar que também aparece de forma clara no momento do cadastro/onboarding, não só no
  documento final.
- Checklist de retenção/expurgo de dado sensível (quanto tempo o CNIS fica no bucket após a entrega
  — decidir e documentar uma política, mesmo que seja "mantém enquanto a assinatura estiver ativa").

## 9.4 Runbook de incidentes

Documento curto (`docs/runbook.md`) com o que fazer quando:
- Webhook do Asaas parar de chegar (usar a reconciliação da Fase 6).
- Teto de gasto for atingido inesperadamente (como identificar o escritório causador).
- Motor falhar em massa (Anthropic/Voyage fora do ar) — mensagem que o portal deve mostrar.
- Necessidade de desativar um escritório (suspensão manual).

## Critério de aceite — Fase 9
Custo real por peça medido e dentro da meta (ou desvio reportado e aprovado). Word desktop abre o
`.docx` sem reparo. Zero dado sensível encontrado na auditoria de log. Páginas legais no ar.
Runbook escrito.

---

# FASE 10 — Go-live operacional

## Objetivo
Ligar o dinheiro de verdade e receber o primeiro cliente pagante real. Esta fase tem tanto de
código quanto de operação — não delegar a parte operacional ao Codex, ela é sua.

## 10.1 Asaas em produção

- Trocar `ASAAS_ENVIRONMENT=sandbox` por produção **somente em produção** (nunca em Preview).
- Confirmar conta Asaas real vinculada a CNPJ/conta bancária.
- Refazer o teste de webhook (item 2.4 do brief da Fase 6) contra o ambiente de produção do Asaas —
  sandbox e produção do Asaas às vezes divergem em detalhe de payload; não presumir que o que
  passou em sandbox necessariamente se comporta idêntico.

## 10.2 Resend em produção

- Verificar o domínio de envio real (SPF/DKIM) no Resend.
- Disparar um e-mail de teste real dos 6 gatilhos definidos na Fase 6, para uma caixa sua, antes de
  qualquer cliente receber.

## 10.3 Primeiro cliente piloto real (operação sua)

- Onboarding manual acompanhado do primeiro escritório pagante (ex: Kemelly Romão).
- Setup + assinatura cobrados de verdade.
- Acompanhar as primeiras 2-3 peças geradas para esse escritório com atenção redobrada no QA antes
  de qualquer entrega.

## 10.4 Rollback

- Documentar (no runbook da Fase 9) como reverter um deploy da Vercel rapidamente se algo quebrar
  logo após o go-live.

## Critério de aceite — Fase 10
Primeiro escritório pagante real, com cobrança real processada, peça real entregue e QA aprovado
por um humano. **Este é o marco de lançamento do produto — não uma fase de código como as
anteriores.**

---

## Regra geral para as 4 fases

Cada fase segue o mesmo processo das Fases 1-6: branch própria, PR própria, CI verde
(`validate` + `database`) antes de qualquer merge, sem pular etapa para "economizar tempo". Se algo
neste brief for tecnicamente inviável ou exigir uma decisão de produto não coberta aqui, parar e
reportar — não presumir.

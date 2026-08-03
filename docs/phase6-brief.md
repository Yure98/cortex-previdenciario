# Fase 6 — Cobrança (Asaas) e Notificações (Resend)

Brief de execução. Segue as mesmas fontes da verdade das fases anteriores (`BRIEF-CODEX.md`, `INSTRUCOES-CODEX.md`, `design-tokens.md`). Esta é a fase mais delicada do projeto: é a primeira que **movimenta dinheiro real** e a primeira que **recebe requisição de fora** (webhook). Erro aqui não é bug de tela — é cobrança indevida, receita perdida ou cliente bloqueado sem motivo.

---

## 0. Pré-requisitos (antes de qualquer código)

1. Mergear a PR #4 na `main`.
2. Confirmar a CI da `main` verde após o merge (validate + database, 42 pgTAP).
3. Só então abrir a branch `agent/phase6-billing`.

---

## 1. Não negociáveis desta fase

Estes pontos não são preferência de estilo — são o que separa uma integração de cobrança correta de um incidente financeiro.

1. **Idempotência obrigatória no webhook.** O Asaas reenvia eventos (retry automático em falha ou timeout). Processar o mesmo evento duas vezes não pode creditar peça em dobro, gerar fatura duplicada nem reativar assinatura cancelada. Persistir `asaas_event_id` com constraint UNIQUE e ignorar repetição — não confiar em "provavelmente não vai repetir".
2. **Nunca confiar apenas no corpo do webhook.** Validar o token de autenticação do webhook (header configurado no painel do Asaas, comparado com `ASAAS_WEBHOOK_TOKEN` em *constant-time*) **e**, para eventos que liberam acesso ou dinheiro, reconsultar o recurso na API do Asaas antes de aplicar o efeito. Corpo de webhook é entrada não confiável.
3. **Dinheiro em inteiro (centavos).** Nunca `float` para valor monetário. R$ 397,00 = `39700`. Arredondamento em ponto flutuante em cobrança recorrente vira divergência acumulada.
4. **Sem dado sensível em e-mail.** Nada de CNIS, CPF, NIT, laudo ou conteúdo da peça no corpo do e-mail. E-mail notifica e leva ao portal; o dado fica atrás de autenticação. (Mesmo princípio do guardrail LGPD do RAG.)
5. **Sandbox primeiro.** Toda a implementação e os testes rodam contra `ASAAS_ENVIRONMENT=sandbox`. Nenhuma chave de produção neste ciclo.
6. **Falha fechada em bloqueio, falha aberta em notificação.** Se a checagem de inadimplência falhar por erro técnico, bloquear (protege receita). Se o envio de e-mail falhar, registrar e seguir — e-mail nunca pode derrubar a geração de uma peça.
7. Não afrouxar RLS, guardrail LGPD do RAG, teto de gasto ou o gate de QA já existentes.

---

## 2. Escopo — Cobrança (Asaas)

### 2.1 Ciclo comercial aprovado

| Item | Valor | Quando |
|---|---|---|
| Setup | R$ 600,00 | uma vez, ao concluir o onboarding (timbrado aceito) |
| Assinatura | R$ 397,00/mês | primeira cobrança 30 dias após o setup |
| Franquia | 25 peças/mês | reseta na virada da competência |
| Excedente | R$ 29,00/peça | acima da franquia |

### 2.2 Cliente e cobrança

- Criar/vincular o escritório a um **customer** no Asaas (persistir `asaas_customer_id` em `escritorios`).
- Gerar a **cobrança de setup** ao concluir o onboarding; registrar em `faturas` com `tipo = setup`.
- Criar a **assinatura recorrente** com primeira cobrança em D+30; persistir `asaas_subscription_id` em `assinaturas`.
- Aceitar Pix, boleto e cartão (definir na criação da cobrança).

### 2.3 Excedente — decisão de produto a implementar

Hoje o motor **bloqueia** com `EXCEDENTE_NAO_PAGO` quando a franquia acaba. Falta o caminho para o advogado destravar. Implementar:

- No portal, em `/portal/plano`: ação **"Comprar peças extras"** (pacotes de 1, 5 ou 10 peças a R$ 29,00 cada).
- Gera cobrança avulsa no Asaas (`tipo = addon`).
- **Crédito só é liberado após confirmação de pagamento pelo webhook** — nunca na criação da cobrança.
- Crédito pago não expira na virada do mês (é peça comprada, não franquia).

### 2.4 Webhook

Rota `POST /api/webhooks/asaas`:

1. Validar token do header em constant-time. Token inválido → 401, sem processar.
2. Ler `event` e `payment.id` / `subscription.id`.
3. **Deduplicar** por `asaas_event_id` (UNIQUE). Já processado → 200 imediato, sem reprocessar.
4. Reconsultar o recurso na API do Asaas (não confiar no corpo).
5. Aplicar o efeito em transação única.
6. Registrar em `auditoria`.

Eventos mínimos a tratar:

| Evento | Efeito |
|---|---|
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | marcar fatura paga; se addon, creditar peças; se setup, liberar; se mensalidade, manter `ativo` |
| `PAYMENT_OVERDUE` | marcar fatura vencida; escritório → `inadimplente` |
| `PAYMENT_REFUNDED` / `PAYMENT_DELETED` | estornar efeito; se addon, remover crédito não consumido |
| `SUBSCRIPTION_DELETED` | assinatura cancelada; escritório → `cancelado` |

Sempre responder **200** para evento reconhecido e processado (ou já processado). Erro interno → 500 para o Asaas reenviar.

### 2.5 Reconciliação (webhook perdido)

Webhook pode não chegar. Implementar rota administrativa `POST /api/admin/reconciliar` (restrita a `platform_admin`) que consulta o Asaas e sincroniza faturas/assinaturas dos últimos N dias. Sem isso, um webhook perdido deixa cliente pagante bloqueado.

### 2.6 Efeito no bloqueio de geração

A lógica de bloqueio **já existe** no banco (`autorizar_geracao_caso`). Esta fase apenas passa a **alimentá-la com dados reais** do Asaas. Não reimplementar a regra na aplicação.

---

## 3. Escopo — Notificações (Resend)

Enviar e-mail transacional, sempre com link para o portal e **sem dado sensível no corpo**:

| Gatilho | Conteúdo |
|---|---|
| Onboarding concluído | boas-vindas + próximos passos |
| Peça pronta para revisão (caso → `qa`) | "sua peça está pronta", link para o portal |
| Peça entregue | link para o portal (nunca anexar o `.docx`) |
| Franquia em 80% | aviso de consumo |
| Franquia esgotada | como comprar peças extras |
| Fatura vencida | aviso de bloqueio iminente + link de pagamento |

Requisitos: domínio verificado no Resend; falha de envio registrada mas **não bloqueante**; template no design system (Inter, `#111111`, canvas branco).

---

## 4. Banco de dados

Migration `0014_phase6_billing.sql`:

- `escritorios`: `asaas_customer_id`.
- `assinaturas`: `asaas_subscription_id`.
- `faturas`: `asaas_payment_id`, `valor_centavos` (integer), `tipo` incluindo `addon`.
- Nova tabela `webhook_eventos`: `id`, `asaas_event_id` **UNIQUE**, `tipo`, `payload_hash`, `processado_em`, `resultado`.
- Nova tabela `creditos_peca`: `escritorio_id`, `quantidade`, `origem` (`addon`), `fatura_id`, `consumido`, `criado_em`.
- Função para creditar peça pós-pagamento, executável apenas por `service_role`.
- RLS: escritório lê seus próprios créditos e faturas; ninguém escreve pelo navegador.

---

## 5. Testes obrigatórios

Além de lint/typecheck/build:

1. **Webhook duplicado** não gera efeito duplo (mesmo `asaas_event_id` duas vezes → um crédito só).
2. **Token inválido** → 401 sem efeito colateral.
3. **Cálculo em centavos** sem perda de precisão.
4. `PAYMENT_OVERDUE` → escritório `inadimplente` → geração bloqueada.
5. Pagamento confirmado de addon → crédito liberado → geração autorizada.
6. Estorno remove crédito não consumido.
7. pgTAP: usuário comum não lê fatura/crédito de outro escritório (mantém o padrão das fases anteriores).
8. Falha no Resend não quebra o fluxo de geração.

---

## 6. Critério de aceite

- Onboarding concluído gera cobrança de setup no sandbox.
- Assinatura criada com primeira cobrança em D+30.
- Webhook processa, deduplica e aplica efeito corretamente.
- Franquia esgotada → compra de extras → pagamento confirmado → geração liberada.
- Inadimplência bloqueia; pagamento reabre.
- E-mails disparados nos 6 gatilhos, sem dado sensível.
- CI verde nos dois jobs, pgTAP incluindo os novos testes de isolamento.
- Nenhum segredo no repositório; tudo em env.

## 7. Fora de escopo

Deploy em produção, chaves reais do Asaas, aplicação da migration em produção, cobrança de imposto/nota fiscal, dunning avançado (régua de recuperação multi-etapa).

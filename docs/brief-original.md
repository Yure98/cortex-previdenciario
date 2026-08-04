# Córtex Previdenciário - Brief de Construção (para Codex)

Documento de especificação. O Codex deve construir a plataforma conforme abaixo. NÃO alterar o método jurídico das skills (elas já existem no repo `cortex-agentes`); a plataforma é o **envelope** ao redor delas.

---

## 1. O que é

SaaS/serviço que entrega peças previdenciárias prontas no **timbrado do escritório**. O advogado sobe o CNIS + fatos → recebe o `.docx` pronto. Núcleo de IA = skills do Cortex (Peticionador + Analista CNIS no MVP). Modelo: assinatura recorrente (Asaas). Foco: qualidade extrema + zero fricção + confiança.

**Wedge competitivo** (o mercado já tem Previdenciarista, Cálculo Jurídico, Debit etc.): não é "IA gera petição" (commodity). É **peça pronta no timbrado + estilo do escritório + revisão humana (concierge) + Visual Law**. A saída é DELE, não um modelo genérico.

---

## 2. Stack (obrigatório)

- **Frontend + Backend:** Next.js 14 (App Router, TypeScript), hospedado na **Vercel**.
- **Banco + Auth + Storage:** **Supabase** (Postgres, Row-Level Security, Storage buckets).
- **Motor de IA:** **Claude Agent SDK** (`@anthropic-ai/sdk` / agent SDK) rodando as skills do repo `cortex-agentes`.
- **Pagamentos:** **Asaas** (assinatura recorrente, Pix/boleto/cartão, webhooks).
- **E-mail:** Resend.
- **Domínio:** Hostinger (DNS aponta pra Vercel).
- **Repo:** GitHub (Yure98).

---

## 3. Arquitetura do MOTOR (caching + teto de gasto — CRÍTICO)

O motor é uma rota de API (`/api/gerar`) que recebe um caso e devolve o `.docx`. Requisitos não negociáveis:

### 3.1 Prompt caching (obrigatório)
- Os prompts das skills + arquivos de referência (mapa normativo, modelos) são **estáticos**. Marcar esses blocos com `cache_control: { type: "ephemeral" }` na chamada da API Anthropic.
- Estrutura da chamada: bloco 1 = prompt da skill + references (CACHEADO); bloco 2 = contexto do caso (dinâmico, não cacheado).
- Meta: reduzir custo de input em ~70-90% nas chamadas repetidas. Registrar `cache_creation_input_tokens` e `cache_read_input_tokens` na tabela `uso_tokens`.

### 3.2 Teto de gasto (spend cap)
- Variável de config global `LIMITE_GASTO_MENSAL_USD` e por escritório `escritorios.teto_token_mensal`.
- **Antes de cada geração**, checar o consumo acumulado do mês (tabela `uso_tokens`). Se ultrapassar o teto do escritório ou o global → **bloquear a geração** e retornar erro `TETO_ATINGIDO` (não rodar a IA).
- Registrar cada chamada em `uso_tokens`: escritorio_id, caso_id, modelo, input_tokens, output_tokens, cache_read, cache_creation, custo_estimado_usd, criado_em.
- Modelo padrão: **Claude Sonnet** (equilíbrio custo/qualidade). Parametrizável por env.

### 3.3 Fluxo do motor
1. Recebe `{ escritorio_id, caso_id, tipo_operacao (peticao|cnis), inputs, formato (tradicional|visual_law), pesquisar_juris (bool) }`.
2. Checa teto de gasto → se estourar, aborta.
3. Carrega o `config` do escritório (timbrado, cores, estilo).
4. Roda a skill correspondente do `cortex-agentes` via Agent SDK (com caching).
5. Gera o `.docx` no timbrado (usa a lógica do agente Timbrado; python-docx via um microserviço ou lib JS docx equivalente — ver 3.4).
6. Salva o `.docx` no bucket `entregas`, grava `uso_tokens`, atualiza `casos.status`.
7. Retorna `{ arquivo_url, custo_usd, status }`.

### 3.4 Geração do .docx
- Preencher o `{{CONTEUDO_PETICAO}}` do timbrado `.docx` do escritório preservando cabeçalho/rodapé/logo/margens.
- Se `formato = visual_law`: montar sumário, timeline (tabela), tabela de provas, boxes de destaque DENTRO do .docx.
- Se o escritório não tiver timbrado: gerar `.docx` limpo com nome/OAB no cabeçalho.
- Implementar via `docx` (npm) no Node, OU um microserviço Python com `python-docx` chamado pelo motor. Preferir o que for mais fiel ao preenchimento de template com preservação de header/footer.

---

## 4. Banco de dados (Supabase, com RLS por escritório)

Tabelas: `escritorios`, `usuarios`, `casos`, `documentos`, `entregas`, `jurisprudencia`, `assinaturas`, `faturas`, `uso_tokens`, `auditoria`, `feedback`.

- **RLS obrigatório:** cada `usuario` só acessa linhas do seu `escritorio_id`. Admin (service role) acessa tudo.
- Campos-chave por tabela (mínimo):
  - `escritorios`: id, nome, oab, cidade, plano, status, timbrado_path, cor_primaria, cor_secundaria, cor_acento, notebooklm_url, teto_token_mensal, data_onboarding.
  - `casos`: id, escritorio_id, cliente_final, beneficio, tipo_peca, formato, pesquisou_juris, status (recebido|producao|qa|entregue), prioridade, sla_ate, criado_em, entregue_em.
  - `documentos`: id, caso_id, tipo (cnis|peticao|anexo), arquivo_path, versao, criado_em.
  - `entregas`: id, caso_id, arquivo_path, revisado_por, qa_status, enviado_em.
  - `uso_tokens`: id, escritorio_id, caso_id, modelo, input_tokens, output_tokens, cache_read, cache_creation, custo_usd, criado_em.
  - `assinaturas`: id, escritorio_id, plano, valor, ciclo, status, asaas_id, proximo_vencimento.
  - `faturas`: id, escritorio_id, valor, tipo (setup|mensal|addon), status, asaas_id, pago_em.
  - `auditoria`: id, caso_id, evento, autor, timestamp.
- **Storage buckets:** `cnis`, `timbrados`, `entregas` (privados, acesso por RLS/signed URLs; nunca públicos — dados sensíveis LGPD).

---

## 5. Portal do advogado (o que o cliente vê)

- **Auth** (Supabase): login/senha + recuperação.
- **Onboarding** (1ª vez): upload do timbrado `.docx`, cores da marca, URL do NotebookLM (opcional), dados do escritório.
- **Novo caso:** upload do CNIS (PDF) + formulário (benefício, fatos, pedidos) + 2 perguntas (pesquisar jurisprudência sim/não; formato tradicional/Visual Law).
- **Meus casos:** lista com status em tempo real.
- **Entrega:** download do `.docx` + aviso de "minuta assistida por IA, revisar antes de protocolar".
- **Plano/uso:** quantas peças usou no mês, limite do plano.

## 6. Painel admin (só Yure)

- **Dashboard:** MRR, casos no mês, em produção, SLA em risco, gasto de token do mês vs teto, NPS.
- **Fila (Kanban):** Recebido → Produção → QA → Entregue. Filtro por escritório/benefício.
- **Detalhe do caso:** inputs, documentos, botão "Rodar motor", checklist de QA, botão "Entregar", trilha de auditoria.
- **Escritórios:** perfis, plano, timbrado, teto de token, consumo.
- **Financeiro:** faturas Asaas, MRR, inadimplência.
- **Uso/custo:** consumo de token por escritório e global vs teto.

---

## 7. Pagamentos (Asaas)

- Planos: Essencial R$497 (8 peças), Profissional R$997 (20), Escritório R$1.997 (40+). Setup único R$497-997. Excedente R$69/peça.
- Assinatura recorrente via Asaas; webhook atualiza `assinaturas`/`faturas`.
- Bloquear geração se assinatura `inadimplente`.
- Limite de peças do plano controla `status` do caso (excedente vira fatura addon).

---

## 8. Design system (paleta e tipografia - USAR EXATAMENTE)

Base: Cal.com design system (ver `design-tokens.md` no projeto). Resumo obrigatório:

**Cores:** primary `#111111`, canvas `#ffffff`, surface-soft `#f8f9fa`, surface-card `#f5f5f5`, surface-dark (footer) `#101010`, hairline `#e5e7eb`, ink `#111111`, body `#374151`, muted `#6b7280`, on-primary `#ffffff`, accent `#3b82f6` (raro), success `#10b981`, warning `#f59e0b`, error `#ef4444`.

**Tipografia:** display (h1/h2/h3) em **Cal Sans** (substituto: Inter 600 com letter-spacing -0.04em, ou Manrope 700); corpo/UI/botões/nav em **Inter**; código em JetBrains Mono. Nunca misturar: display sempre no display face, corpo sempre Inter.

**Formas:** raio 8px (botões/inputs), 12px (cards), 16px (hero), pill (badges/nav), full (avatares). Botão primário preto `#111111`, texto branco, 40px altura, raio 8px.

**Layout:** canvas branco, cards cinza-claro `#f5f5f5`, footer escuro `#101010` (única superfície escura). Espaçamento entre seções 96px, padding de card 32px. Max width 1200px.

**Tom:** SaaS moderno, confiante, muito whitespace, monocromático na camada de ação (nada de cor no CTA). Ver Do's/Don'ts em `design-tokens.md`.

---

## 9. O que "entregar" significa (saída esperada)

1. **Repo funcional** no GitHub com Next.js + Supabase + motor, deployável na Vercel.
2. **Variáveis de ambiente** documentadas em `.env.example`: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `ASAAS_API_KEY`, `RESEND_API_KEY`, `MODELO_CLAUDE` (default sonnet), `LIMITE_GASTO_MENSAL_USD`.
3. **Migrations SQL** do schema + políticas RLS (rodáveis no Supabase).
4. **Motor com caching e teto de gasto** funcionando e registrando `uso_tokens`.
5. **Portal + Admin** conforme seções 5 e 6, no design system da seção 8.
6. **README** com passo a passo de setup (Supabase, Asaas, Vercel, DNS Hostinger).
7. **Sem** hardcode de segredo; tudo por env. Buckets privados. RLS ativo.

**Critério de aceite do MVP:** um advogado faz onboarding (sobe timbrado) → cria um caso com CNIS → o motor gera o `.docx` no timbrado dele respeitando teto de gasto e usando caching → aparece no admin pra QA → é entregue no portal. Pagamento recorrente ativo no Asaas.

---

## 10. Fora de escopo do MVP (fase 2)
Maternidade e Recurso (outras skills), multiusuário avançado, relatórios de NPS automatizados, app mobile. Deixar a arquitetura pronta pra plugar novas skills (roteamento por `tipo_operacao`).

## 11. Biblioteca de teses (RAG) - arquitetura de escala

NÃO criar 1 agente por tese. Criar uma **biblioteca (dados)** servida a poucos agentes generalistas via **RAG**. Isso mantém o custo por peça travado (~R$2-3) mesmo com 200 teses.

- **Tabela `teses`:** id, slug, titulo, beneficio, categoria, requisitos, base_legal, jurisprudencia_chave, provas_necessarias, modelo_redacao, erros_comuns, tags, embedding (vector), status, versao, data_corte, atualizado_em.
- **pgvector no Supabase** para busca semântica.
- **Fluxo:** ao gerar uma peça: (1) classificar o caso (Haiku), (2) buscar por embedding as **1-3 teses mais relevantes**, (3) injetar SÓ essas no prompt do Analista/Redator (custo limitado, não carrega as 200).
- **Ficha padrão de tese** (o que curar por tese): requisitos + base legal + jurisprudência-chave (com marcador de conferência) + provas + redação-modelo + erros comuns.
- **MVP:** ~25 teses (maior volume, ~80% dos casos). Expandir para ~200. Cada tese **versionada + data de corte** (controle de vigência legislativa).

## 12. Modelos por cliente x biblioteca compartilhada (regra de IP/LGPD - CRÍTICA)

- **Templates PRIVADOS do escritório:** cada escritório pode subir seus próprios modelos/peças, que viram a biblioteca **privada dele** (tabela `modelos_escritorio`, isolada por RLS). Usados SÓ para personalizar a saída DELE. Feature + moat, sem problema de IP.
- **Biblioteca COMPARTILHADA (as ~200 teses):** construída de fontes **públicas** (jurisprudência, modelos públicos, curadoria própria/especialista). **NUNCA** usar a peça de um cliente para servir outro sem **consentimento explícito** - a peça contém dado sensível de terceiro (o segurado) e é IP do advogado. Contribuição para o pool compartilhado só via **opt-in explícito no contrato** e de-identificada.

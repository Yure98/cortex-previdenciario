# Fase 4 — relatório de aceite do portal do advogado

Data: 2026-08-03

## Pré-requisitos concluídos

- PR #1 mergeada na `main` (`5b3a961b073e6b3479746fbed953c78afde783dc`).
- README corrigido para refletir as Fases 1–3.
- baseline migrado para Next.js 15.5.22 e React 19.2.8.
- migração publicada e mergeada pela PR #2 (`af3209eb5acdcdd9364f91d2e86e9923f40d4135`).
- CI da PR #2: aplicação aprovada; banco aprovado com 38 testes pgTAP, incluindo isolamento RLS.

## Entregas da Fase 4

### Autenticação

- cadastro self-service com criação automática do escritório pelo trigger existente;
- login e logout com Supabase Auth;
- confirmação de e-mail por PKCE/callback;
- recuperação e redefinição de senha;
- middleware para renovação de sessão e proteção de `/portal`;
- redirecionamento de usuário sem sessão e de usuário autenticado fora da tela de login.

### Onboarding

- wizard curto em três etapas: escritório, identidade visual e timbrado;
- nome, OAB, cidade, cores e URL HTTPS opcional do NotebookLM;
- upload DOCX com progresso real no navegador;
- validação de limite, extensão, MIME, assinatura ZIP e preflight estrutural;
- exigência do marcador `{{CONTEUDO_PETICAO}}` pelo preflight de produção;
- armazenamento no bucket privado `timbrados`, sob pasta do escritório;
- aviso de sobreposição/variações de cabeçalho sem redesenho automático;
- escritório ativado somente depois que o timbrado é aceito.

### Casos e geração

- wizard em três etapas para benefício/CNIS, fatos/pedidos e preferências;
- perguntas obrigatórias de jurisprudência e formato tradicional/Visual Law;
- upload CNIS PDF com progresso, limite, MIME, extensão e assinatura `%PDF-`;
- tenant derivado exclusivamente da sessão;
- armazenamento privado sob `{escritorio}/{caso}/...`;
- criação do registro documental e limpeza compensatória se upload/persistência falhar;
- disparo do motor da Fase 2 com chave de idempotência;
- feedback visível durante upload e geração longa;
- falhas comerciais, de teto ou RAG preservam o caso e são exibidas ao usuário.

### Portal

- dashboard com consumo do mês, saldo da franquia e atividade recente;
- lista de casos com estados recebidos, produção, QA e entrega;
- atualização de status por Supabase Realtime;
- detalhe do caso com teses aplicadas;
- resumo destacado, requisitos e provas em checklists;
- base legal/jurisprudência recolhível;
- marcadores `[CONFERIR]` destacados em amarelo;
- aviso permanente de revisão profissional;
- área de plano/uso com 25 peças incluídas, excedentes utilizados e faturas;
- download de entrega por rota autenticada que valida o escritório e emite signed URL curta.

### Segurança

- nenhuma chave secreta foi adicionada ao cliente ou ao repositório;
- rotas de mutação verificam autenticação e mesma origem;
- limites de corpo/arquivo são checados antes do processamento pesado;
- service role é usada apenas depois de resolver usuário e escritório pela sessão;
- IDs de escritório enviados pelo navegador não são aceitos;
- buckets permanecem privados; download de entrega não ganhou policy pública;
- RAG e guardrail LGPD das fases anteriores não foram alterados;
- nenhuma migration ou policy RLS foi modificada na Fase 4.

## Design

- tokens do projeto aplicados: canvas branco, `#111111`, cartões `#f5f5f5`, raio 8/12 px;
- Inter para UI/corpo e Cal Sans para display;
- largura máxima de 1.200 px e espaçamento generoso;
- superfície escura restrita ao cartão de plano;
- layout responsivo para navegação, métricas, listas, formulários e detalhe.

## Validação executada

- ESLint: aprovado, zero warnings.
- TypeScript: aprovado.
- Vitest: 49/49 testes aprovados em 10 arquivos.
- Python: 3/3 testes aprovados.
- Squawk: 12 migrations, zero issues.
- compilação Python: aprovada.
- build Next.js 15.5.22: aprovado; 12 rotas geradas.
- `git diff --check`: aprovado.

O build emite um aviso não bloqueante do pacote Supabase sobre referências Node no bundle Edge
do middleware. A compilação termina com sucesso. O audit mantém apenas os avisos `sharp/libvips`
sem correção disponível, herdados do Next.js; o projeto usa imagens não otimizadas e não envia
imagens de usuário ao Sharp, conforme `SECURITY.md`.

## Pendência operacional de publicação

O checkout está na branch `agent/phase4-portal`, mas ainda sem commit/push/PR. O workflow de
publicação exige o GitHub CLI, e `gh` não está instalado neste ambiente. A autorização da
integração não instala o executável. Depois que o CLI estiver disponível e autenticado, devem
ser executados commit, push, PR draft e CI; a CI fará novamente o pgTAP real.

O pgTAP local desta rodada também não iniciou porque a CLI tentou criar `/root/.supabase`, em
filesystem somente leitura. Isso não indica falha de teste. A última execução real do mesmo
schema ocorreu na PR #2 e passou 38/38 testes; a Fase 4 não alterou migrations.

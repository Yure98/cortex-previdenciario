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

## Dependência Next.js 14

A especificação fixa Next.js 14. A última versão dessa major (`14.2.35`) não recebe correções
para os advisories atuais; `npm audit --omit=dev` continua reportando uma dependência direta
de severidade alta e informa `fixAvailable: false` dentro da major.

Mitigações aplicadas enquanto a restrição existir:

- `next/image` sem otimizador;
- nenhuma rewrite, middleware/proxy, i18n, WebSocket ou servidor customizado;
- nenhum Server Action e corpo configurado para no máximo 1 MB caso um seja introduzido;
- homepage pré-renderizada estaticamente;
- `/api/gerar` roda em Node, limita corpo a 16 KB e sempre responde `Cache-Control: no-store`;
- nenhuma entrada não confiável em `beforeInteractive` ou nonce CSP.

Essas medidas reduzem superfície, mas não transformam Next.js 14 em uma versão com suporte de
segurança. Antes de exposição pública, o gate recomendado é migrar para a linha LTS corrigida e
reexecutar build, testes e auditoria. A migração de major não foi feita porque contraria a fonte
de verdade aprovada do projeto.

## Relato

Não inclua CPF, NIT, CNIS, chaves ou URLs assinadas em issues. Envie relatos de segurança por
canal privado ao proprietário do repositório.

# Fase 5 — Admin e QA

Implementada em 3 de agosto de 2026 sobre a `main` no commit `90378d1`.

## Escopo

- dashboard com MRR, casos, SLA, NPS e gasto vs. teto;
- Kanban Recebido → Produção → QA → Entregue;
- detalhe do caso, documentos, custos e auditoria;
- rodar/reprocessar motor no tenant selecionado;
- checklist de QA com entrega bloqueada até aprovação integral;
- módulos de escritórios e financeiro;
- acesso exclusivo por `usuarios.papel = platform_admin`, sem e-mail hardcoded.

## Banco e segurança

A migration `0013_phase5_admin_qa.sql` adiciona o revisor da plataforma e duas funções
transacionais. Ambas executam `is_platform_admin()` no banco. Advogados continuam limitados ao
próprio tenant. Os quatro testes pgTAP adicionais exercitam a exceção cross-tenant e elevam o
conjunto esperado de 38 para 42 testes SQL.

## Validação

O primeiro checkout passou localmente em ESLint, TypeScript, 53 testes Vitest, 3 testes Python,
Squawk para 13 migrations e build Next.js 15.5.22. A CI da branch deve repetir o banco real antes
do merge.

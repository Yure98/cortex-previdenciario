# Fase 3 — relatório de aceite da entrega DOCX

Data de fechamento: 2026-08-03.

## Resultado

O gate técnico da Fase 3 está fechado. A rota `/api/gerar` produz `.docx` tradicional
ou Visual Law, preserva o timbrado quando válido, usa um documento limpo quando não há
template, publica o objeto em bucket privado e devolve uma signed URL temporária.

## Matriz de aceite

| Critério | Implementação | Evidência |
|---|---|---|
| Timbrado preservado | Patch em `word/document.xml`; parts existentes permanecem intactos | hashes de header/footer iguais no teste unitário; render de 5 páginas |
| Preflight de produção | limites ZIP, CRC, traversal, duplicatas, macros/ActiveX/embeddings, XML/rels e marcador único | testes unitários e matriz real de QA |
| Separador `\` tolerado | normalização somente na cópia processada | teste automatizado e template real reempacotado |
| Nome sanitizado | `peticao_[slug]_[AAAA-MM-DD].docx` | teste com acentos, apóstrofo e tentativa de traversal |
| Bucket privado | bucket `entregas` com `public=false`; sem policy de objeto para cliente | migrations 0008/0012 e pgTAP de schema |
| Signed URL | emitida pelo backend, TTL configurável 60–900 s, download forçado | teste unitário com TTL de 300 s |
| Registro atômico | RPC conclui geração, caso, consumo e auditoria junto da entrega | migration 0012 e contrato pgTAP |
| Tradicional | estrutura jurídica, listas Word e `[CONFERIR]` destacado | geração/renderização final |
| Visual Law | sumário, quadro visual, timeline, provas/pendências e alertas | geração/renderização final |
| Fallback | header/footer limpos, margens, paginação e aviso de revisão humana | geração/renderização final |
| Abre sem reparo | validação OOXML + abertura por consumidor independente | JSZip/CRC, `python-docx` e LibreOffice |

## Segurança e persistência

- O caminho do template precisa iniciar com o UUID do escritório.
- O caminho de entrega contém escritório, caso e geração.
- O upload usa MIME DOCX e `cache-control: private, max-age=0, no-store`.
- A signed URL é criada sob demanda e não é gravada em tabela ou log.
- Metadados persistidos: nome, MIME, tamanho, SHA-256 e relatório de preflight.
- A RPC da entrega é executável apenas por `service_role`.
- O preflight do timbrado ocorre antes da reserva comercial e antes de qualquer gasto de IA.
- O arquivo real de QA e os artefatos com a identidade visual do escritório não fazem parte
  do repositório.

## QA estrutural e visual

A matriz foi gerada pelo mesmo `generateDeliveryDocx` usado em produção:

| Variante | Páginas renderizadas | Resultado |
|---|---:|---|
| Tradicional com timbrado | 5 | íntegro; conteúdo e listas válidos |
| Visual Law com timbrado | 5 | íntegro; quadros/tabelas sem corte |
| Tradicional fallback | 4 | íntegro; layout limpo |
| Visual Law fallback | 4 | íntegro; quadros/tabelas sem corte |

Todos os quatro pacotes passaram em ZIP/CRC, parsing XML/relationships, abertura com
`python-docx` e renderização headless pelo LibreOffice, sem mensagem ou fluxo de reparo.
As 18 páginas foram inspecionadas. Não houve Microsoft Word desktop disponível; portanto,
o aceite declara interoperabilidade OOXML e abertura em dois consumidores independentes,
sem afirmar um teste que não foi executado.

O timbrado de teste possui variantes `first`, `default` e `even` cujo desenho se aproxima do
corpo em páginas subsequentes. A mesma sobreposição aparece no template e nas duas estratégias
comparadas. Por decisão de produto, o onboarding avisará o escritório e pedirá revisão do
preview, sem redesenhar o documento automaticamente.

## Testes automatizados

- lint Next/ESLint sem avisos;
- TypeScript sem erros;
- 44 testes unitários Vitest;
- 3 testes Python;
- Squawk em 12 migrations, sem ocorrências;
- build otimizado do Next.js 14 concluído;
- pgTAP: 32 contratos de schema e 6 provas de RLS, executados pela CI com Supabase local.

## Operação

Use `ENTREGA_SIGNED_URL_TTL_SECONDS=300` por padrão. O backend aceita valores de 60 a
900 segundos. Em retry idempotente de uma geração concluída, consulte a entrega pelo par
geração/escritório e emita uma nova URL em vez de reutilizar a anterior.

Para repetir a matriz DOCX:

```bash
npm run docx:qa -- caminho/timbrado.docx caminho/saida
```

Os artefatos gerados são dados de QA e devem permanecer fora do Git.

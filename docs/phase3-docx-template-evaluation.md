# Fase 3 — avaliação de preservação de template DOCX

Data do ensaio: 2026-08-03.

## Objetivo

Escolher a estratégia de geração do `.docx` usando um timbrado real fornecido para
QA, com o marcador `{{CONTEUDO_PETICAO}}`, sem publicar o arquivo ou seus dados no
repositório.

Foram comparadas três capacidades:

1. biblioteca npm `docx` 9.6.1;
2. edição com `python-docx` 1.2.0;
3. edição Node por preservação do pacote OOXML com JSZip 3.10.1.

## Achados de entrada

O arquivo recebido é um ZIP íntegro, mas possui duas irregularidades que exigem
preflight no produto:

- as entradas internas usam `\` em vez de `/`, de modo que LibreOffice e
  `python-docx` recusam o pacote original. O responsável pelo arquivo confirmou que
  isso foi introduzido pelo processo de reempacotamento em .NET/PowerShell e não
  representa o upload real; a tolerância continua obrigatória como defesa de entrada;
- a margem esquerda está serializada como twips decimal
  (`1700.7874015748032`), e `python-docx` espera um inteiro quando essa propriedade
  é acessada.

Para a comparação, foi criada uma cópia normalizada apenas nos nomes das entradas
ZIP. O arquivo recebido ficou intocado. O produto deverá normalizar e validar o
template no upload, registrar advertências e nunca modificar silenciosamente o
original armazenado.

## Resultado de capacidade

| Critério | `docx` npm | `python-docx` | Node OOXML/JSZip |
|---|---:|---:|---:|
| Abre template existente | Não | Sim, após preflight | Sim, após preflight |
| API de import/round-trip | Não existe | Existe | Implementada no envelope |
| Marcador normal | Não aplicável | Passou | Passou |
| Marcador dividido em runs | Não aplicável | Passou | Passou |
| Cabeçalho/rodapé/logo/marca-d'água | Não aplicável | Preservados visualmente | Preservados visualmente e por hash de payload |
| Margens e referências de seção | Não aplicável | Iguais semanticamente | Iguais semanticamente |
| ZIP íntegro após geração | Não aplicável | Passou | Passou |
| Renderização de 5 páginas | Não aplicável | Passou | Passou |
| Paridade visual Node/Python | Não aplicável | 5/5 páginas idênticas | 5/5 páginas idênticas |

A classe `Document` da biblioteca npm `docx` não expõe `open`, `load`,
`fromBuffer`, `fromDocx` ou método equivalente. Ela é adequada para criar um
documento novo, não para fazer round-trip de um timbrado arbitrário.

O `python-docx` produziu a mesma renderização que a rota Node, inclusive no ensaio
de cinco páginas. Entretanto, ao salvar, ele resserializou `[Content_Types].xml`,
relacionamentos, headers, footer, styles, settings e numbering, mesmo sem mudança
semântica nesses componentes.

A rota Node/OOXML alterou somente `word/document.xml`; headers, footer, mídia,
estilos, configurações, numeração, tema, tipos de conteúdo e relacionamentos
mantiveram payload SHA-256 idêntico ao template-base.

## Decisão

Adotar uma estratégia Node híbrida:

- `docx` npm para construir blocos novos e o documento limpo de fallback;
- JSZip + patch OOXML para inserir os blocos no marcador do timbrado;
- estilos explícitos nos blocos inseridos, evitando depender de estilos globais
  do escritório;
- nenhum microserviço Python na Fase 3.

Essa decisão mantém o runtime no Next.js/Vercel, preserva com maior fidelidade os
pacotes enviados pelos escritórios e ainda permite tabelas, boxes, timeline,
sumário e demais elementos de Visual Law.

## Preflight obrigatório do template

Antes da geração, o módulo deverá:

1. validar assinatura ZIP e limites contra zip bomb;
2. rejeitar path traversal e entradas duplicadas após normalização;
3. normalizar separadores internos sem sobrescrever o upload original;
4. validar partes OOXML obrigatórias e relacionamentos;
5. exigir exatamente um marcador, aceitando texto dividido entre runs;
6. normalizar medidas numericamente inválidas de forma determinística e auditável;
7. preservar todos os parts não relacionados ao corpo;
8. executar teste de integridade antes do upload da entrega.

## Observação visual do timbrado

No ensaio longo, o cabeçalho, o rodapé e a marca-d'água repetiram exatamente como
definidos no arquivo. O próprio template possui variantes `first`, `default` e
`even`; em páginas subsequentes, parte do conteúdo se aproxima ou se sobrepõe à
área gráfica do cabeçalho. Como a ocorrência foi pixel a pixel igual nas duas
rotas, ela pertence ao template, não à biblioteca escolhida. O produto deve
advertir sobre esse risco no preview de onboarding, sem redesenhar o timbrado do
cliente automaticamente.

## Estado do gate da Fase 3

Gate completo fechado. A implementação final inclui upload no bucket privado
`entregas`, signed URL temporária, nome sanitizado, fallback limpo, formatos
tradicional e Visual Law e validação estrutural após o preflight de produção.

Os quatro artefatos da matriz final passaram por verificação ZIP/CRC, parsing de
todas as partes XML/relationships, abertura pelo `python-docx` e renderização pelo
LibreOffice sem fluxo de reparo. As 18 páginas renderizadas foram inspecionadas
visualmente. O Word desktop não estava disponível no ambiente de CI/QA e não é
alegado como consumidor testado.

O relatório completo está em `docs/phase3-acceptance-report.md`.

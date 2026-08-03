# Biblioteca de teses

Novas teses são dados versionados, não mudanças de schema.

1. Crie um JSON como lista de fichas seguindo os campos da tabela `teses`.
2. Preserve `[CONFERIR]` onde a curadoria jurídica ainda não validou uma referência.
3. Execute `npm run teses:importar -- caminho/arquivo.json`.
4. O importador força `status = rascunho` e remove qualquer embedding recebido.
5. Revisão humana, ativação e geração de embedding são etapas separadas.

Nunca use peças, modelos ou dados de um escritório para alimentar a biblioteca compartilhada.

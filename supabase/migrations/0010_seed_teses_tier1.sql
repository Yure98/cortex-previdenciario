-- Catálogo Tier 1 conforme CORTEX-25-teses-mvp.md.
-- Todos entram como RASCUNHO. A ativação e o embedding exigem revisão humana.
set lock_timeout = '5s';
set statement_timeout = '120s';

insert into public.teses (slug, titulo, beneficio, tags, status, metadata)
values
  (
    'auxilio-doenca-concessao',
    'Auxílio por Incapacidade Temporária (Auxílio-Doença) - Concessão',
    'incapacidade',
    array['incapacidade temporaria', 'pericia', 'carencia', 'qualidade de segurado', 'DII', 'DER'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-fichas-tier1-novas.md"}'::jsonb
  ),
  (
    'restabelecimento-auxilio-doenca',
    'Restabelecimento de Auxílio-Doença Cessado (Alta Indevida)',
    'incapacidade',
    array['alta indevida', 'restabelecimento', 'incapacidade temporaria'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-25-teses-mvp.md"}'::jsonb
  ),
  (
    'aposentadoria-incapacidade-permanente',
    'Aposentadoria por Incapacidade Permanente (Invalidez)',
    'incapacidade',
    array['incapacidade permanente', 'aposentadoria por invalidez'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-25-teses-mvp.md"}'::jsonb
  ),
  (
    'conversao-auxilio-doenca-aposentadoria-incapacidade',
    'Conversão de Auxílio-Doença em Aposentadoria por Incapacidade',
    'incapacidade',
    array['conversao de beneficio', 'incapacidade permanente', 'incapacidade temporaria'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-25-teses-mvp.md"}'::jsonb
  ),
  (
    'bpc-loas-deficiente',
    'BPC-LOAS à Pessoa com Deficiência',
    'bpc',
    array['bpc', 'loas', 'deficiencia'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-25-teses-mvp.md"}'::jsonb
  ),
  (
    'bpc-loas-idoso',
    'BPC-LOAS ao Idoso (65+)',
    'bpc',
    array['bpc', 'loas', 'idoso'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-25-teses-mvp.md"}'::jsonb
  ),
  (
    'aposentadoria-idade-rural-segurado-especial',
    'Aposentadoria por Idade Rural (Segurado Especial)',
    'rural',
    array['rural', 'segurado especial', 'economia familiar', 'inicio de prova material', 'lavrador', 'boia-fria'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-ficha-tese-modelo.md"}'::jsonb
  ),
  (
    'salario-maternidade-rural',
    'Salário-Maternidade Rural (Segurada Especial)',
    'familia',
    array['salario maternidade', 'rural', 'segurado especial'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-25-teses-mvp.md"}'::jsonb
  ),
  (
    'auxilio-acidente',
    'Auxílio-Acidente',
    'incapacidade',
    array['auxilio acidente', 'sequela', 'reducao capacidade', 'nexo causal', 'indenizatorio'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-fichas-tier1-novas.md"}'::jsonb
  ),
  (
    'aposentadoria-especial',
    'Aposentadoria Especial (15/20/25 anos - agentes nocivos)',
    'aposentadoria',
    array['tempo especial', 'agentes nocivos', 'ruido', 'PPP', 'LTCAT', 'EPI', 'insalubridade'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-fichas-tier1-novas.md"}'::jsonb
  ),
  (
    'aposentadoria-pcd-lc142',
    'Aposentadoria da Pessoa com Deficiência (LC 142/2013)',
    'aposentadoria',
    array['pcd', 'deficiencia', 'avaliacao biopsicossocial', 'grau de deficiencia', 'LC 142'],
    'rascunho',
    '{"tier": 1, "curadoria": "pendente", "fonte": "CORTEX-fichas-tier1-novas.md"}'::jsonb
  )
on conflict (slug) do nothing;

update public.teses
set
  resumo = 'Segurado incapaz temporariamente para o trabalho, com qualidade de segurado e carência cumprida, tem direito ao benefício desde a DII/DER.',
  requisitos = '["Incapacidade temporária comprovada (perícia)", "Qualidade de segurado na DII", "Carência: 12 contribuições (isento em acidente de qualquer natureza e doenças graves da lista)"]'::jsonb,
  base_legal = '["Arts. 59 a 63 da Lei 8.213/91; art. 26/27 (carência)"]'::jsonb,
  jurisprudencia_chave = '["Isencao de carencia para doencas graves listadas [CONFERIR: Portaria/lista vigente]", "Fixacao da DII pela pericia judicial retroagindo a DER [CONFERIR]"]'::jsonb,
  provas_necessarias = '["laudos e exames medicos", "atestados", "CAT se acidentario", "comprovacao de qualidade de segurado"]'::jsonb,
  estrategia = 'Fixar DII e DER; pedir retroativos desde a cessacao/indeferimento; refutar conclusao pericial administrativa.',
  erros_comuns = '["nao demonstrar qualidade de segurado na DII", "confundir DII e DER", "ignorar periodo de graca"]'::jsonb
where slug = 'auxilio-doenca-concessao';

update public.teses
set
  resumo = 'Sequela consolidada que reduz a capacidade laboral gera auxílio-acidente (natureza indenizatória, 50% do salário de benefício), independente de carência.',
  requisitos = '["Sequela consolidada que reduz a capacidade para o trabalho habitual", "Nexo causal entre o acidente/doença e a sequela", "Qualidade de segurado (sem exigência de carência)"]'::jsonb,
  base_legal = '["Art. 86 da Lei 8.213/91"]'::jsonb,
  jurisprudencia_chave = '["Reducao minima da capacidade ja gera o beneficio [CONFERIR: Sumula 44 TNU]", "Cumulacao com aposentadoria vedada apos a Lei 9.528/97 [CONFERIR]"]'::jsonb,
  provas_necessarias = '["laudo pericial da sequela", "CAT", "exames", "nexo"]'::jsonb,
  estrategia = 'Diferenciar de auxilio-doenca (aqui a incapacidade e parcial e permanente); provar o nexo e a reducao.',
  erros_comuns = '["confundir com auxilio-doenca", "nao provar o nexo", "pedir cumulacao vedada"]'::jsonb
where slug = 'auxilio-acidente';

update public.teses
set
  resumo = 'A pessoa com deficiência tem aposentadoria por tempo de contribuição reduzido (conforme o grau) ou por idade reduzida, mediante avaliação biopsicossocial.',
  requisitos = '["Por tempo: grave 25H/20M, moderada 29/24, leve 33/28 [CONFERIR anos exatos]", "Por idade: 60H/55M + 15 anos de contribuição", "Comprovação da deficiência e do grau por avaliação médica e social (biopsicossocial)"]'::jsonb,
  base_legal = '["LC 142/2013", "Decreto 8.145/2013"]'::jsonb,
  jurisprudencia_chave = '["Marco temporal e grau da deficiencia ao longo do periodo contributivo [CONFERIR]"]'::jsonb,
  provas_necessarias = '["laudos", "avaliacao biopsicossocial", "historico da deficiencia"]'::jsonb,
  estrategia = 'Fixar o grau e o periodo da deficiencia; pedir a modalidade mais vantajosa.',
  erros_comuns = '["ignorar a avaliacao social", "errar o grau", "nao mapear a deficiencia ao longo do tempo"]'::jsonb
where slug = 'aposentadoria-pcd-lc142';

update public.teses
set
  resumo = 'A exposição habitual e permanente a agentes nocivos por 15, 20 ou 25 anos gera aposentadoria especial; pós-EC 103 exige idade mínima/pontuação na transição.',
  requisitos = '["Tempo de exposição: 15, 20 ou 25 anos conforme o agente/grau", "Exposição habitual e permanente, comprovada por PPP/LTCAT", "Pós-EC 103: idade mínima (55/58/60) ou pontuação na transição [CONFERIR]"]'::jsonb,
  base_legal = '["Arts. 57 e 58 da Lei 8.213/91", "EC 103/2019"]'::jsonb,
  jurisprudencia_chave = '["EPI eficaz nao afasta o ruido acima do limite [CONFERIR: Tema 555 STF]", "Enquadramento por categoria ate 28/04/1995 [CONFERIR]"]'::jsonb,
  provas_necessarias = '["PPP", "LTCAT", "laudos tecnicos", "historico de exposicao"]'::jsonb,
  estrategia = 'Comprovar exposicao habitual/permanente; atacar EPI eficaz no caso de ruido; somar/converter periodos.',
  erros_comuns = '["aceitar EPI eficaz sem analise", "errar o marco de 1995/2019", "PPP incompleto"]'::jsonb
where slug = 'aposentadoria-especial';

update public.teses
set
  categoria = 'rural / idade',
  data_corte = date '2026-08-03',
  resumo = 'O trabalhador rural em regime de economia familiar tem direito a aposentadoria por idade com idade reduzida (60 H / 55 M) e carencia cumprida como tempo de atividade rural, desde que apresente inicio de prova material corroborado por prova testemunhal.',
  requisitos = '["Idade: 60 anos (homem) / 55 anos (mulher)", "Carencia: 180 meses (15 anos) de atividade rural, no periodo imediatamente anterior ao requerimento", "Condicao: exercicio de atividade rural em regime de economia familiar (segurado especial)"]'::jsonb,
  base_legal = '["Art. 48, paragrafos 1o e 2o, Lei 8.213/91 (idade reduzida rural)", "Art. 11, VII, Lei 8.213/91 (segurado especial)", "Art. 39 e Art. 143, Lei 8.213/91 (regra de comprovacao)", "Art. 55, paragrafo 3o, Lei 8.213/91 (prova material)"]'::jsonb,
  jurisprudencia_chave = '["Sumula 149/STJ: a prova exclusivamente testemunhal nao basta - exige inicio de prova material", "Tema 554/STJ: o inicio de prova material nao precisa cobrir todo o periodo de carencia [CONFERIR]", "Descontinuidade da atividade rural admitida [CONFERIR: sumula/tema aplicavel]", "Prova material em nome de terceiro (familiar) aproveita ao grupo familiar [CONFERIR]"]'::jsonb,
  provas_necessarias = '["Inicio de prova material contemporaneo: bloco de notas de produtor rural, contrato de parceria/arrendamento, certidoes (casamento/nascimento) com profissao lavrador, CCIR/ITR, declaracao de sindicato rural homologada, historico escolar rural", "Prova testemunhal para ampliar o periodo (audiencia)"]'::jsonb,
  estrategia = 'Point-first: abrir afirmando o direito e a tese central. Demonstrar o inicio de prova material e amplia-lo por testemunhas. Antecipar a defesa do INSS: ausencia/insuficiencia de prova material e descontinuidade.',
  modelo_redacao = '{"dos_fatos":"[Narrar a trajetoria rural do segurado, em regime de economia familiar, desde [PREENCHER: periodo], com os documentos que compoem o inicio de prova material.]","do_direito":"[Fundamentar no art. 48 da Lei 8.213/91 + Sumula 149/STJ; demonstrar que o inicio de prova material esta presente e e corroborado por testemunhas.]","dos_pedidos":"[Concessao do beneficio desde a DER; pagamento de atrasados; tutela se cabivel.]"}',
  erros_comuns = '["Fundamentar so em prova testemunhal (viola Sumula 149/STJ)", "Documentos fora do periodo de carencia", "Confundir segurado especial com contribuinte individual rural (muda tudo)", "Nao antecipar a tese de descontinuidade do INSS"]'::jsonb
where slug = 'aposentadoria-idade-rural-segurado-especial';

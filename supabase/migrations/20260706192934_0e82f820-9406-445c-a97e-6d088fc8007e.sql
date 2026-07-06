
-- 1. Restaurar event_key original dos formulários fixos (preserva vínculo com automações antigas)
UPDATE public.form_definitions SET event_key = 'atualizacao_apoiador_concluida' WHERE slug = 'recadastro-fixo';
UPDATE public.form_definitions SET event_key = 'inscricao_concluida'          WHERE slug = 'inscrever-fixo';

-- 2. Semear perguntas do catálogo faltando em recadastro-fixo (idempotente via WHERE NOT EXISTS)
DO $$
DECLARE
  v_form_id uuid;
  v_next int;
  r record;
BEGIN
  SELECT id INTO v_form_id FROM public.form_definitions WHERE slug='recadastro-fixo';
  IF v_form_id IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT * FROM (VALUES
      ('endereco_completo',         'Endereço completo',                                  'CEP é opcional — se não souber, preencha o resto manualmente.'),
      ('email',                     'E-mail',                                             NULL),
      ('nome_social',               'Nome social / apelido',                              NULL),
      ('profissao',                 'Profissão / ocupação',                               NULL),
      ('instituicao',               'Onde trabalha',                                      NULL),
      ('formas_ajuda',              'Como você pode ajudar?',                             NULL),
      ('formas_ajuda_outro',        'Se marcou "Outro" em "Como você pode ajudar", descreva aqui', NULL),
      ('participa_movimento_social','Participa de algum movimento social?',               NULL),
      ('movimento_social_nome',     'Qual movimento social?',                             NULL),
      ('coletivo_alicerce',         'Faz parte do Coletivo Alicerce?',                    NULL),
      ('como_conheceu',             'Como você conheceu a campanha?',                     NULL)
    ) AS t(catalog_key, lbl, helptxt)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.form_definition_questions
      WHERE form_definition_id = v_form_id AND catalog_field_key = r.catalog_key
    ) THEN
      SELECT COALESCE(MAX(order_index)+1, 0) INTO v_next
        FROM public.form_definition_questions WHERE form_definition_id = v_form_id;
      INSERT INTO public.form_definition_questions
        (form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
      VALUES (v_form_id, v_next, 'catalog', r.catalog_key, r.lbl, r.helptxt, false);
    END IF;
  END LOOP;
END $$;

-- 3. Semear endereço completo opcional em inscrever-fixo (opção A do plano)
DO $$
DECLARE
  v_form_id uuid;
  v_next int;
BEGIN
  SELECT id INTO v_form_id FROM public.form_definitions WHERE slug='inscrever-fixo';
  IF v_form_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.form_definition_questions
    WHERE form_definition_id = v_form_id AND catalog_field_key = 'endereco_completo'
  ) THEN
    SELECT COALESCE(MAX(order_index)+1, 0) INTO v_next
      FROM public.form_definition_questions WHERE form_definition_id = v_form_id;
    INSERT INTO public.form_definition_questions
      (form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
    VALUES (v_form_id, v_next, 'catalog', 'endereco_completo',
            'Endereço (opcional)',
            'Se quiser, informe pelo menos cidade e UF — o CEP e o resto são opcionais.',
            false);
  END IF;
END $$;

-- Migração de dados: cria as 2 linhas fixas em form_definitions (recadastro/atualizacao
-- e inscrever), preservando o event_key original de cada uma (para não quebrar o
-- histórico de automation_deliveries já existente) e semeando as perguntas
-- correspondentes aos campos hoje coletados pelos handlers dedicados.
-- As rotas /recadastro, /atualizacao e /inscrever continuam existindo com a mesma URL,
-- passando a renderizar o motor genérico do construtor apontando pra estas linhas.
--
-- Os slugs usam sufixo "-fixo" (em vez de "recadastro"/"inscrever" puros) de propósito:
-- os handlers antigos e dedicados (src/routes/api/public/forms/recadastro.ts e
-- inscrever.ts) ainda existem no código (só serão excluídos depois de validar a
-- paridade) e são rotas ESTÁTICAS que, no roteamento por arquivo, têm precedência
-- sobre a rota dinâmica $slug.ts pro mesmo caminho — usar o slug literal "recadastro"
-- faria /api/public/forms/recadastro cair no handler antigo em vez do motor genérico.

INSERT INTO public.form_definitions
  (id, title, slug, is_active, is_fixed, source_form_type, event_key, whatsapp_button_enabled)
VALUES
  ('50931783-6ac9-4795-bf08-ff28d609f9d8', 'Formulário de cadastro completo', 'recadastro-fixo',
   true, true, 'cadastro_completo', 'atualizacao_apoiador_concluida', false),
  ('32577eed-c86a-41d6-86aa-fce60845a162', 'Formulário de receber informações', 'inscrever-fixo',
   true, true, 'receber_informacoes', 'inscricao_concluida', false)
ON CONFLICT (slug) DO NOTHING;

-- Perguntas do "Formulário de cadastro completo" (equivalente a /recadastro hoje).
INSERT INTO public.form_definition_questions
  (form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
SELECT * FROM (VALUES
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 0, 'catalog', 'nome', 'Nome completo', NULL::text, true),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 1, 'catalog', 'whatsapp', 'WhatsApp', 'Com DDD, ex.: (11) 91234-5678', true),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 2, 'catalog', 'consentimento', 'Aceito receber mensagens da campanha pelo WhatsApp', NULL::text, true),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 3, 'catalog', 'nome_social', 'Nome social / apelido', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 4, 'catalog', 'email', 'E-mail', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 5, 'catalog', 'endereco_completo', 'Endereço completo', 'CEP é opcional — se não souber, preencha o resto manualmente.', false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 6, 'catalog', 'profissao', 'Profissão / ocupação', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 7, 'catalog', 'instituicao', 'Onde trabalha', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 8, 'catalog', 'coletivo_alicerce', 'Faz parte do Coletivo Alicerce?', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 9, 'catalog', 'participa_movimento_social', 'Participa de algum movimento social?', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 10, 'catalog', 'movimento_social_nome', 'Qual movimento social?', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 11, 'catalog', 'formas_ajuda', 'Como você pode ajudar?', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 12, 'catalog', 'formas_ajuda_outro', 'Se marcou "Outro" em "Como você pode ajudar", descreva aqui', NULL::text, false),
  ('50931783-6ac9-4795-bf08-ff28d609f9d8'::uuid, 13, 'catalog', 'como_conheceu', 'Como você conheceu a campanha?', NULL::text, false)
) AS v(form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
WHERE NOT EXISTS (
  SELECT 1 FROM public.form_definition_questions
  WHERE form_definition_id = '50931783-6ac9-4795-bf08-ff28d609f9d8'
);

-- Perguntas do "Formulário de receber informações" (equivalente a /inscrever hoje).
INSERT INTO public.form_definition_questions
  (form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
SELECT * FROM (VALUES
  ('32577eed-c86a-41d6-86aa-fce60845a162'::uuid, 0, 'catalog', 'nome', 'Nome completo', NULL::text, true),
  ('32577eed-c86a-41d6-86aa-fce60845a162'::uuid, 1, 'catalog', 'whatsapp', 'WhatsApp (com DDD)', 'Ex.: (11) 91234-5678', true),
  ('32577eed-c86a-41d6-86aa-fce60845a162'::uuid, 2, 'catalog', 'consentimento', 'Autorizo receber comunicações da campanha por WhatsApp', NULL::text, true),
  ('32577eed-c86a-41d6-86aa-fce60845a162'::uuid, 3, 'catalog', 'endereco_completo', 'Endereço completo', 'CEP é opcional — se não souber, preencha o resto manualmente.', false)
) AS v(form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
WHERE NOT EXISTS (
  SELECT 1 FROM public.form_definition_questions
  WHERE form_definition_id = '32577eed-c86a-41d6-86aa-fce60845a162'
);

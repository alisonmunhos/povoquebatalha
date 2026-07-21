-- Cadastro encadeado: depois de criar login/senha (Passo 1, /cadastro-agitador
-- ou /cadastro-usuario), a pessoa é levada automaticamente pra uma segunda
-- etapa de ficha completa de apoiador ("Cadastro de Usuário Alicerce"),
-- pré-preenchida com o que o contato já tiver (achado por e-mail/telefone em
-- link_or_create_user_contact, que já roda hoje no Passo 1).
--
-- prefill_from_token é opt-in (default false): só a linha nova abaixo liga essa
-- flag. /recadastro, /atualizacao e /inscrever continuam sem pré-preenchimento,
-- comportamento idêntico ao de hoje.
ALTER TABLE public.form_definitions
  ADD COLUMN IF NOT EXISTS prefill_from_token boolean NOT NULL DEFAULT false;

-- Mesmo padrão de 20260706155840_...sql (seed de recadastro-fixo/inscrever-fixo):
-- UUID fixo pra ser referenciado por código (handleUserSignup), imune a rename
-- de slug/título feito depois pela aba Entrada de Dados.
INSERT INTO public.form_definitions
  (id, title, slug, is_active, is_fixed, source_form_type, event_key, whatsapp_button_enabled, prefill_from_token)
VALUES
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91', 'Cadastro de Usuário Alicerce', 'cadastro-usuario-alicerce',
   true, true, 'cadastro_completo', 'cadastro_usuario_alicerce_concluido', false, true)
ON CONFLICT (slug) DO NOTHING;

-- Perguntas: mesmo conjunto de recadastro-fixo, mais disponibilidade (nenhum
-- formulário fixo pergunta isso hoje, mas é ficha de apoiador de verdade).
INSERT INTO public.form_definition_questions
  (form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
SELECT * FROM (VALUES
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 0, 'catalog', 'nome', 'Nome completo', NULL::text, true),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 1, 'catalog', 'whatsapp', 'WhatsApp', 'Com DDD, ex.: (11) 91234-5678', true),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 2, 'catalog', 'consentimento', 'Aceito receber mensagens da campanha pelo WhatsApp', NULL::text, true),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 3, 'catalog', 'nome_social', 'Nome social / apelido', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 4, 'catalog', 'email', 'E-mail', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 5, 'catalog', 'endereco_completo', 'Endereço completo', 'CEP é opcional — se não souber, preencha o resto manualmente.', false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 6, 'catalog', 'profissao', 'Profissão / ocupação', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 7, 'catalog', 'instituicao', 'Onde trabalha', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 8, 'catalog', 'coletivo_alicerce', 'Faz parte do Coletivo Alicerce?', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 9, 'catalog', 'participa_movimento_social', 'Participa de algum movimento social?', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 10, 'catalog', 'movimento_social_nome', 'Qual movimento social?', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 11, 'catalog', 'formas_ajuda', 'Como você pode ajudar?', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 12, 'catalog', 'formas_ajuda_outro', 'Se marcou "Outro" em "Como você pode ajudar", descreva aqui', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 13, 'catalog', 'disponibilidade', 'Quando você pode ajudar?', NULL::text, false),
  ('a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'::uuid, 14, 'catalog', 'como_conheceu', 'Como você conheceu a campanha?', NULL::text, false)
) AS v(form_definition_id, order_index, source, catalog_field_key, label, help_text, required)
WHERE NOT EXISTS (
  SELECT 1 FROM public.form_definition_questions
  WHERE form_definition_id = 'a7c1e9d4-3f6b-4a82-9e15-6d0c4f8b2a91'
);

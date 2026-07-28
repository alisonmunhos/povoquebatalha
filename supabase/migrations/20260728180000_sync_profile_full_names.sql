-- Sincroniza profiles.full_name a partir de contacts.nome para contas cujo nome
-- no perfil ficou igual ao e-mail (cadastro antigo / link_or_create sem nome real).
--
-- Antes de aplicar em produção, rode o diagnóstico abaixo no SQL Editor e confira
-- se há outros casos além dos 3 corrigidos aqui:
--
-- SELECT
--   p.id,
--   p.full_name AS nome_perfil_errado,
--   au.email,
--   c.nome AS nome_contato_correto,
--   p.contact_id
-- FROM public.profiles p
-- JOIN auth.users au ON au.id = p.id
-- LEFT JOIN public.contacts c ON c.id = p.contact_id
-- WHERE p.full_name LIKE '%@%'
--   AND p.id <> 'bd7242a9-5741-4f4b-8c18-797689c4c6c7'::uuid
-- ORDER BY p.full_name;
--
-- NÃO sincronizar bd7242a9-5741-4f4b-8c18-797689c4c6c7 (Julia):
--   perfil = "Julia Fontana Dexheimer", contato = "Julia Deremier" — pessoas diferentes.

UPDATE public.profiles AS p
SET full_name = c.nome
FROM public.contacts AS c
WHERE p.contact_id = c.id
  AND p.id IN (
    'c8d28e9d-75bd-42a0-995e-db821872ec7f'::uuid,
    '7d890e1b-ce12-4bf8-b49f-72e53b7745d9'::uuid,
    'ba896e63-a29c-410b-a749-c44a097f4c6e'::uuid
  )
  AND c.nome IS NOT NULL
  AND trim(c.nome) <> ''
  AND p.full_name IS DISTINCT FROM c.nome;

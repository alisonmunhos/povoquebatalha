
-- 1) Adicionar coluna system_role em contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS system_role public.app_role;

-- 2) Backfill vinculando as 4 contas existentes
-- Alison (admin) → contato existente "Alison Acosta Munhos"
UPDATE public.profiles SET contact_id = '6b2c8bdc-12c6-4a85-8ad5-18ff124f3203'
  WHERE id = '24fb8128-b4a0-434b-b8fb-a3229f400820' AND contact_id IS NULL;
UPDATE public.contacts
   SET email = COALESCE(email, 'alisonmunhos@gmail.com'),
       is_system_user = true,
       system_role = 'admin'
 WHERE id = '6b2c8bdc-12c6-4a85-8ad5-18ff124f3203';

-- Faylon (admin) → faylon silva lima
UPDATE public.profiles SET contact_id = 'ec577dc1-b3a7-4ff6-82ee-68d7f13b356b'
  WHERE id = 'ba896e63-a29c-410b-a749-c44a097f4c6e' AND contact_id IS NULL;
UPDATE public.contacts
   SET is_system_user = true, system_role = 'admin'
 WHERE id = 'ec577dc1-b3a7-4ff6-82ee-68d7f13b356b';

-- Ezequiel (sem papel no momento) → EZEQUIEL CARVALHO VIAPIANA
UPDATE public.profiles SET contact_id = '4646601f-1c4a-48fd-86b9-51f3fc47c3f5'
  WHERE id = '86d067a8-41a4-4994-8950-7310014dcd85' AND contact_id IS NULL;
UPDATE public.contacts
   SET is_system_user = true
 WHERE id = '4646601f-1c4a-48fd-86b9-51f3fc47c3f5';

-- Tzusy (operador)
UPDATE public.profiles SET contact_id = '2aa7d5ba-e7cd-4c23-85a6-b0b758adf985'
  WHERE id = '7d890e1b-ce12-4bf8-b49f-72e53b7745d9' AND contact_id IS NULL;
UPDATE public.contacts
   SET is_system_user = true, system_role = 'operador'
 WHERE id = '2aa7d5ba-e7cd-4c23-85a6-b0b758adf985';

-- 3) Sincronizar system_role para contatos já vinculados
UPDATE public.contacts c
   SET system_role = sub.role
  FROM (
    SELECT p.contact_id,
           (ARRAY_AGG(ur.role ORDER BY CASE ur.role
              WHEN 'admin' THEN 1
              WHEN 'operador' THEN 2
              WHEN 'comunicacao' THEN 3
              WHEN 'vrm' THEN 4
              WHEN 'agitador' THEN 5
              WHEN 'leitor' THEN 6
              ELSE 99 END))[1] AS role
      FROM public.profiles p
      JOIN public.user_roles ur ON ur.user_id = p.id
     WHERE p.contact_id IS NOT NULL
     GROUP BY p.contact_id
  ) sub
 WHERE c.id = sub.contact_id
   AND (c.system_role IS DISTINCT FROM sub.role);

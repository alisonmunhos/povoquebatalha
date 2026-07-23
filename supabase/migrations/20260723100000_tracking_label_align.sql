-- Alinha rótulos de rastreio legados com os nomes atuais dos formulários fixos
-- e sincroniza active_tracking_label quando o formulário foi renomeado.

UPDATE public.contacts c
   SET active_tracking_label = COALESCE(NULLIF(trim(fd.tracking_name), ''), fd.title),
       active_tracking_form_id = fd.id
  FROM public.form_definitions fd
 WHERE fd.slug = 'inscrever-fixo'
   AND c.is_system_user = false
   AND (
     c.active_tracking_label = 'Inscrição (legado)'
     OR (c.origem = 'inscricao' AND c.active_tracking_form_id IS NULL AND c.active_capture_channel IS NOT NULL)
   );

UPDATE public.contacts c
   SET active_tracking_label = COALESCE(NULLIF(trim(fd.tracking_name), ''), fd.title),
       active_tracking_form_id = fd.id
  FROM public.form_definitions fd
 WHERE fd.slug = 'recadastro-fixo'
   AND c.is_system_user = false
   AND (
     c.active_tracking_label = 'Atualização (legado)'
     OR (
       c.origem = 'recadastro'
       AND c.origem_detalhe IS DISTINCT FROM 'preenchido_por_agitador'
       AND c.active_tracking_form_id IS NULL
       AND c.active_capture_channel IS NOT NULL
     )
   );

UPDATE public.contacts c
   SET active_tracking_label = COALESCE(NULLIF(trim(fd.tracking_name), ''), fd.title)
  FROM public.form_definitions fd
 WHERE c.active_tracking_form_id = fd.id
   AND c.is_system_user = false
   AND c.active_tracking_label IS DISTINCT FROM COALESCE(NULLIF(trim(fd.tracking_name), ''), fd.title);

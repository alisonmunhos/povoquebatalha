UPDATE public.whatsapp_templates
SET buttons = '[{"type":"URL","text":"CADASTRE-SE AQUI","url":"https://povoquebatalha.lovable.app/f/seja-um-apoiador-a-da-campanha-do-povo-que-batalha-copia?ref=e2TTHKGBJhvcL8bsxlHN1cyU"}]'::jsonb,
    updated_at = now()
WHERE meta_template_id = '920939000509337' OR name = 'convite_para_cadastro';
-- Ajusta o critério padrão de lifecycle_status:
-- só marca 'recadastro_concluido' quando o contato tem telefone válido E (cidade OU profissão).
-- Caso contrário, deixa NULL para não afirmar algo falso.

CREATE OR REPLACE FUNCTION public.contacts_phone_fill()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
DECLARE p jsonb; p2 jsonb;
BEGIN
  IF NEW.nome IS NOT NULL THEN
    NEW.nome_normalizado := lower(public.unaccent(trim(NEW.nome)));
  END IF;

  IF NEW.phone_raw IS NOT NULL THEN
    p := private.parse_phone_br(NEW.phone_raw, NULL);
    NEW.phone_digits := p->>'phone_digits';
    NEW.phone_ddi := p->>'phone_ddi';
    NEW.phone_ddd := p->>'phone_ddd';
    NEW.phone_e164 := p->>'phone_e164';
    NEW.phone_last8 := p->>'phone_last8';
    NEW.phone_last9 := p->>'phone_last9';
    NEW.phone_whatsapp_candidate := p->>'phone_whatsapp_candidate';
    IF NEW.phone_status IS NULL THEN
      NEW.phone_status := (p->>'status')::public.contact_phone_status;
    END IF;
  END IF;

  IF NEW.phone_secundario_raw IS NOT NULL AND length(btrim(NEW.phone_secundario_raw)) > 0 THEN
    p2 := private.parse_phone_br(NEW.phone_secundario_raw, NULL);
    NEW.phone_secundario_e164 := p2->>'phone_e164';
    NEW.phone_secundario_last8 := p2->>'phone_last8';
  ELSE
    NEW.phone_secundario_raw := NULL;
    NEW.phone_secundario_e164 := NULL;
    NEW.phone_secundario_last8 := NULL;
  END IF;

  IF NEW.lifecycle_status IS NULL THEN
    IF NEW.origem = 'import' THEN
      NEW.lifecycle_status := 'importado_aguardando_recadastro'::public.contact_lifecycle_status;
    ELSIF NEW.phone_status = 'valido'
          AND (COALESCE(NEW.cidade,'') <> '' OR COALESCE(NEW.profissao,'') <> '') THEN
      NEW.lifecycle_status := 'recadastro_concluido'::public.contact_lifecycle_status;
    ELSE
      NEW.lifecycle_status := NULL;
    END IF;
  END IF;

  RETURN NEW;
END; $function$;

-- Correção pontual em contatos já existentes que hoje têm 'recadastro_concluido'
-- mas não atendem o novo critério: volta para NULL.
UPDATE public.contacts
   SET lifecycle_status = NULL
 WHERE lifecycle_status = 'recadastro_concluido'
   AND NOT (
     phone_status = 'valido'
     AND (COALESCE(cidade,'') <> '' OR COALESCE(profissao,'') <> '')
   );
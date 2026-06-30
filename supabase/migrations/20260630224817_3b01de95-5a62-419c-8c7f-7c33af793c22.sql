
REVOKE EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, jsonb, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, jsonb, text, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, jsonb, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, jsonb, text, text) TO service_role;

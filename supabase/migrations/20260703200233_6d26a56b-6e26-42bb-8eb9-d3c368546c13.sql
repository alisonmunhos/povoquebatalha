
-- Lock down SECURITY DEFINER functions: revoke public EXECUTE, grant only to intended callers.

-- Privileged RPCs (called only via service_role from server code)
REVOKE ALL ON FUNCTION public.merge_contacts(uuid, uuid, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_contacts(uuid, uuid, jsonb, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.link_or_create_user_contact(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_or_create_user_contact(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.apply_contact_source(uuid, uuid, public.source_module, public.source_form_type, uuid, public.source_event_type, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_contact_source(uuid, uuid, public.source_module, public.source_form_type, uuid, public.source_event_type, jsonb) TO service_role;

-- Trigger functions (only executed by triggers as table owner; no direct callers needed)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contacts_phone_fill() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contacts_address_fill() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.contacts_consent_timestamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conv_sync_from_campaign() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conv_sync_from_direct() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conv_sync_from_automation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conv_sync_from_inbound() FROM PUBLIC, anon, authenticated;

-- resolve_tracked_link is intentionally callable by anon (public forms use publishable key);
-- keep the default EXECUTE for anon/authenticated.

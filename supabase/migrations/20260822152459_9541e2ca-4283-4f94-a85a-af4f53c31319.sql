-- Remove acesso público (anon) às funções SECURITY DEFINER criadas agora
REVOKE EXECUTE ON FUNCTION public.recalc_conversation_unread(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.conv_open_on_inbound() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.conv_set_aguardando_on_direct() FROM PUBLIC;

-- Concede apenas para papéis internos. A aplicação chama recalc via server functions autenticadas.
GRANT EXECUTE ON FUNCTION public.recalc_conversation_unread(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_conversation_unread(uuid, text) TO service_role;

-- As outras duas são usadas apenas por triggers; não precisam de grant direto.
GRANT EXECUTE ON FUNCTION public.conv_open_on_inbound() TO service_role;
GRANT EXECUTE ON FUNCTION public.conv_set_aguardando_on_direct() TO service_role;
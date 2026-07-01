DROP POLICY IF EXISTS "auth write geocode_cache" ON public.geocode_cache;
DROP POLICY IF EXISTS "auth update geocode_cache" ON public.geocode_cache;
REVOKE INSERT, UPDATE ON public.geocode_cache FROM authenticated;
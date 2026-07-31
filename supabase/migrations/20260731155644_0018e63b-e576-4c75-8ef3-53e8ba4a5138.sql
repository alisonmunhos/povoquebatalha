DROP POLICY IF EXISTS triage_shares_select_authenticated ON public.segment_triage_shares;

CREATE POLICY triage_shares_select_owner_or_admin
ON public.segment_triage_shares
FOR SELECT
TO authenticated
USING ((created_by = auth.uid()) OR private.has_role(auth.uid(), 'admin'::app_role));
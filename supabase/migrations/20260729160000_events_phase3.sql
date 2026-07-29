-- Fase 3: eventos com RSVP público e link opcional na tela de sucesso do formulário.

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  is_published boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT events_slug_unique UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS events_published_starts_idx
  ON public.events (is_published, starts_at DESC);

CREATE TRIGGER trg_events_updated
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.event_rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('confirmed', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_rsvps_unique_contact UNIQUE (event_id, contact_id)
);

CREATE INDEX IF NOT EXISTS event_rsvps_event_idx ON public.event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS event_rsvps_contact_idx ON public.event_rsvps(contact_id);

CREATE TRIGGER trg_event_rsvps_updated
  BEFORE UPDATE ON public.event_rsvps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.form_sections
  ADD COLUMN IF NOT EXISTS linked_event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_rsvps TO authenticated;
GRANT ALL ON public.event_rsvps TO service_role;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_events" ON public.events
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff_manage_events" ON public.events
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

CREATE POLICY "staff_read_event_rsvps" ON public.event_rsvps
  FOR SELECT TO authenticated
  USING (private.is_staff(auth.uid()));

CREATE POLICY "staff_manage_event_rsvps" ON public.event_rsvps
  FOR ALL TO authenticated
  USING (private.is_staff(auth.uid()))
  WITH CHECK (private.is_staff(auth.uid()));

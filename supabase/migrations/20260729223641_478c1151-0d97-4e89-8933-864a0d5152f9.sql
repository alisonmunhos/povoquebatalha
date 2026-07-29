ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS linked_form_definition_id uuid REFERENCES public.form_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_form_start_section_id uuid REFERENCES public.form_sections(id) ON DELETE SET NULL;
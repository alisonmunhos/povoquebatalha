ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS cover_mime text,
  ADD COLUMN IF NOT EXISTS post_rsvp_title text,
  ADD COLUMN IF NOT EXISTS post_rsvp_button_text text,
  ADD COLUMN IF NOT EXISTS post_rsvp_button_url text;

INSERT INTO public.system_notification_settings (key, recipient_roles, title_template, body_template)
VALUES (
  'event_created',
  ARRAY['admin','comunicacao']::app_role[],
  'Novo evento: {{event_title}}',
  'O evento "{{event_title}}" foi criado e está {{event_status}}.'
)
ON CONFLICT (key) DO NOTHING;
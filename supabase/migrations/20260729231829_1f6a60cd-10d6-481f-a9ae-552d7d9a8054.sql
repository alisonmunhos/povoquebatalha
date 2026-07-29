ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS post_rsvp_body text,
  ADD COLUMN IF NOT EXISTS post_decline_title text,
  ADD COLUMN IF NOT EXISTS post_decline_body text,
  ADD COLUMN IF NOT EXISTS post_decline_button_text text,
  ADD COLUMN IF NOT EXISTS post_decline_button_url text;

UPDATE public.events SET
  post_rsvp_title = 'Presença confirmada! 🎉',
  post_rsvp_body = 'Obrigado(a) por confirmar! Agora, clique abaixo pra completar seu cadastro — suas respostas nos ajudam a planejar melhor as próximas ações da campanha, e você entra pra base de quem realmente faz parte disso.',
  post_rsvp_button_text = 'Completar meu cadastro',
  post_rsvp_button_url = '/f/seja-um-apoiador-a-da-campanha-do-povo-que-batalha-copia?s=faa84c35-dbbb-4c7c-903c-d3d62315b143',
  post_decline_title = 'Tudo bem, obrigado por avisar!',
  post_decline_body = 'Mesmo não podendo estar lá, você pode continuar com a gente de outras formas. Clique abaixo pra fazer seu cadastro e ficar por dentro das próximas oportunidades de participar.',
  post_decline_button_text = 'Quero continuar com vocês',
  post_decline_button_url = '/f/seja-um-apoiador-a-da-campanha-do-povo-que-batalha-copia'
WHERE slug = 'plenaria-de-lancamento-da-pre-candidatura-de-karen-santos-a-deputada-estadual-pe';
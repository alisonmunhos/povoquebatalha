insert into public.whatsapp_instances (nome, provider, status, numero_conectado, config, inbound_to_inbox_enabled)
select 'WhatsApp Oficial (Meta)', 'whatsapp_cloud', 'connected', '+555182137088',
  jsonb_build_object('phone_number_id','1370198982834159','waba_id','4304328966545501','graph_version','v23.0'),
  true
where not exists (select 1 from public.whatsapp_instances where provider = 'whatsapp_cloud');

update public.whatsapp_instances
set numero_conectado = '+555182137088',
    status = 'connected',
    config = config || jsonb_build_object('phone_number_id','1370198982834159','waba_id','4304328966545501','graph_version','v23.0'),
    updated_at = now()
where provider = 'whatsapp_cloud';
-- O bucket inbox-media (anexos recebidos pelo webhook do WhatsApp Cloud API,
-- salvo via service role) não tinha nenhuma política em storage.objects.
-- O webhook grava normalmente (service role ignora RLS), mas o navegador da
-- equipe assina a URL do arquivo com a própria sessão (client-side, sujeita a
-- RLS) pra tocar áudio/exibir imagem — sem política de leitura, a assinatura
-- falha e o anexo aparece como indisponível. Mesma lógica de quem pode ler já
-- usada em campaign-media (campaign_media_read_staff): staff autenticado.
CREATE POLICY inbox_media_read_staff ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'inbox-media' AND private.is_staff(auth.uid()));

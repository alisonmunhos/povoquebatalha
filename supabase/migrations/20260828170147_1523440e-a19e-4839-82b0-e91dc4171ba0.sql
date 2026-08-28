-- Quando o download da mídia recebida (Meta -> bucket inbox-media) falha
-- mesmo depois das tentativas automáticas (client.server.ts::downloadCloudMedia),
-- a mensagem antes ficava com media_path nulo em silêncio — indistinguível de
-- uma mensagem que nunca teve mídia. Esse campo marca explicitamente que
-- houve falha real de download, pra dar pra identificar depois.
alter table public.inbound_messages
  add column media_download_failed_at timestamptz null;

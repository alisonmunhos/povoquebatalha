// SERVER-ONLY: processador de lotes usado pelo cron e pelo botão manual.
// Usa supabaseAdmin (bypass RLS) porque roda em background sem usuário logado.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processCampaignBatchShared, type CampaignBatchResult } from "@/lib/campaign-batch.server";

export async function processCampaignBatchInternal(
  campaignId: string,
  batchSize: number = 5,
): Promise<CampaignBatchResult> {
  const { readUseSendLinkFlag } = await import("@/lib/wa-send.server");
  const useSendLink = await readUseSendLinkFlag();
  // Comportamento anterior preservado: cron respeita a flag `use_send_link` e só
  // anexa mídia quando o tipo da campanha é image/document.
  return processCampaignBatchShared(supabaseAdmin, campaignId, batchSize, {
    useSendLink,
    gateAttachmentByTipo: true,
    throwIfNotRunning: false,
  });
}

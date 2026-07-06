// SERVER-ONLY: processador de lotes usado pelo cron e pelo botão manual.
// Usa supabaseAdmin (bypass RLS) porque roda em background sem usuário logado.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function processCampaignBatchInternal(
  campaignId: string,
  batchSize: number = 5,
): Promise<{ processed: number; ok: number; fail: number; skipped: number; done: boolean }> {
  const { data: c } = await supabaseAdmin.from("campaigns").select("*").eq("id", campaignId).single();
  if (!c) throw new Error("Campanha não encontrada");
  if (c.status !== "running") {
    return { processed: 0, ok: 0, fail: 0, skipped: 0, done: c.status === "done" };
  }

  const { data: recs } = await supabaseAdmin
    .from("campaign_recipients")
    .select("id,contact_id,rendered_message,contacts(id,nome,cidade,bairro,uf,phone_e164,phone_whatsapp_candidate,consentimento_whatsapp,opt_out_at,whatsapp_status,recad_token)")
    .eq("campaign_id", campaignId).eq("status", "queued").limit(batchSize);

  if (!recs?.length) {
    await supabaseAdmin.from("campaigns").update({ status: "done" }).eq("id", campaignId);
    return { processed: 0, ok: 0, fail: 0, skipped: 0, done: true };
  }

  const { sendMessage, readUseSendLinkFlag } = await import("@/lib/wa-send.server");
  const useSendLink = await readUseSendLinkFlag();
  let ok = 0, fail = 0, skipped = 0;
  const minMs = c.delay_min_ms ?? 3000;
  const maxMs = c.delay_max_ms ?? 8000;

  let mediaUrl: string | null = c.midia_url ?? null;
  if (c.midia_path && !mediaUrl) {
    const { data: signed } = await supabaseAdmin.storage.from("campaign-media").createSignedUrl(c.midia_path, 60 * 60);
    mediaUrl = signed?.signedUrl ?? null;
  }

  const cc = c as unknown as {
    link_url?: string | null; link_title?: string | null;
    link_description?: string | null; link_image?: string | null;
  };

  for (const r of recs) {
    const { data: cur } = await supabaseAdmin.from("campaigns").select("status").eq("id", campaignId).single();
    if (!cur || cur.status !== "running") break;

    const ct = (r as unknown as { contacts: {
      id: string; nome: string | null; cidade: string | null; bairro: string | null; uf: string | null;
      phone_e164: string | null; phone_whatsapp_candidate: string | null;
      consentimento_whatsapp: boolean; opt_out_at: string | null; whatsapp_status: string | null;
      recad_token: string | null;
    } | null }).contacts;
    if (!ct?.phone_e164 || !ct.consentimento_whatsapp || ct.opt_out_at) {
      await supabaseAdmin.from("campaign_recipients").update({
        status: "opted_out", failed_at: new Date().toISOString(), erro: "sem consentimento ou opt-out",
      }).eq("id", r.id);
      skipped++;
      continue;
    }

    await supabaseAdmin.from("campaign_recipients").update({ status: "sending", tentativas: 1 }).eq("id", r.id);
    try {
      const baseBody = r.rendered_message ?? c.mensagem_template;
      const attachment = mediaUrl && (c.tipo === "image" || c.tipo === "document")
        ? {
            signedUrl: mediaUrl,
            mime: c.tipo === "document" ? (c.midia_mime ?? "application/pdf") : (c.midia_mime ?? "image/jpeg"),
            filename: c.midia_filename ?? "arquivo",
          }
        : null;
      const linkMeta = cc.link_url
        ? {
            url: cc.link_url,
            title: cc.link_title ?? null,
            description: cc.link_description ?? null,
            image: cc.link_image ?? null,
            status: (cc.link_title || cc.link_image ? "preview_confirmada" : "preview_provavel") as
              | "preview_confirmada" | "preview_provavel",
          }
        : null;

      const res = await sendMessage({
        contact: ct,
        text: baseBody,
        textAlreadyRendered: true,
        link: linkMeta,
        attachment,
        useSendLink,
        origin: "campaign",
        skipValidations: true,
      });

      if (!res.ok) throw new Error(res.error ?? res.fallback_reason ?? "erro desconhecido");

      await supabaseAdmin.from("campaign_recipients").update({
        status: "sent", sent_at: new Date().toISOString(),
        message_id: res.message_id, zaap_id: res.zaap_id,
        endpoint_used: res.endpoint_used,
        link_url: res.link_url,
        link_title: res.link_title,
        link_description: res.link_description,
        link_image: res.link_image,
        preview_status: res.preview_status,
        rendered_message: res.rendered_text,
      } as never).eq("id", r.id);
      await supabaseAdmin.from("message_events").insert({
        contact_id: r.contact_id, recipient_id: r.id, tipo: "sent",
        payload: { message_id: res.message_id, zaap_id: res.zaap_id, endpoint_used: res.endpoint_used } as never,
      });
      ok++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "erro desconhecido";
      await supabaseAdmin.from("campaign_recipients").update({
        status: "failed", failed_at: new Date().toISOString(), erro: msg,
      }).eq("id", r.id);
      fail++;
    }

    const delay = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
    await new Promise((res) => setTimeout(res, delay));
  }

  const { data: agg } = await supabaseAdmin
    .from("campaign_recipients").select("status").eq("campaign_id", campaignId);
  if (agg) {
    const counts = { sent: 0, failed: 0, delivered: 0, read: 0 };
    for (const r of agg) {
      const s = (r as { status: string }).status;
      if (s === "sent" || s === "delivered" || s === "read") counts.sent++;
      if (s === "failed") counts.failed++;
      if (s === "delivered" || s === "read") counts.delivered++;
      if (s === "read") counts.read++;
    }
    await supabaseAdmin.from("campaigns").update({
      total_enviados: counts.sent, total_falhas: counts.failed,
      total_entregues: counts.delivered, total_lidos: counts.read,
      ultimo_lote_at: new Date().toISOString(),
    }).eq("id", campaignId);
  }

  const { count: restantes } = await supabaseAdmin
    .from("campaign_recipients").select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId).eq("status", "queued");
  if ((restantes ?? 0) === 0) {
    await supabaseAdmin.from("campaigns").update({ status: "done" }).eq("id", campaignId);
    return { processed: recs.length, ok, fail, skipped, done: true };
  }
  return { processed: recs.length, ok, fail, skipped, done: false };
}

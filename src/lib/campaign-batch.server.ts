// SERVER-ONLY: loop único de processamento de lote de campanha, compartilhado
// pelo botão manual (campaigns.functions.ts) e pelo cron (campaigns.server.ts).
// As duas chamadas divergiam em `useSendLink` e no critério de anexo — preservados
// aqui como parâmetros explícitos em vez de assumidos iguais.
import { BLOCK_LABELS, messageBlockReason } from "@/lib/contact-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendMessage } from "@/lib/wa-send.server";

type Client = SupabaseClient<Database>;

type RecipientContact = {
  id: string;
  nome: string | null;
  cidade: string | null;
  bairro: string | null;
  uf: string | null;
  phone_e164: string | null;
  phone_whatsapp_candidate: string | null;
  consentimento_whatsapp: boolean | null;
  phone_raw: string | null;
  opt_out_at: string | null;
  arquivado_at: string | null;
  lifecycle_status: string | null;
  whatsapp_status: string | null;
  recad_token: string | null;
};

export type CampaignBatchResult = {
  processed: number;
  ok: number;
  fail: number;
  skipped: number;
  done: boolean;
};

export async function pauseCampaignForShadowban(db: Client, campaignId: string): Promise<void> {
  const now = new Date().toISOString();
  await db.from("campaigns").update({
    status: "paused",
    paused_at: now,
    paused_motivo: "Suspeita de shadowban detectada pela Z-API — envio pausado automaticamente.",
  }).eq("id", campaignId);
  try {
    const { data: inst } = await db
      .from("whatsapp_instances")
      .select("id, config")
      .eq("provider", "zapi")
      .maybeSingle();
    if (inst) {
      const cfg = (inst.config ?? {}) as Record<string, unknown>;
      await db
        .from("whatsapp_instances")
        .update({ config: { ...cfg, shadowban_suspected_at: now } })
        .eq("id", inst.id);
    }
  } catch {
    // não bloqueia a pausa da campanha se o flag de instância falhar em gravar
  }
}

export async function processCampaignBatchShared(
  db: Client,
  campaignId: string,
  batchSize: number,
  opts: { useSendLink: boolean; gateAttachmentByTipo: boolean; throwIfNotRunning: boolean },
): Promise<CampaignBatchResult> {
  const { data: c } = await db.from("campaigns").select("*").eq("id", campaignId).single();
  if (!c) throw new Error("Campanha não encontrada");
  if (c.status !== "running") {
    if (opts.throwIfNotRunning) throw new Error(`Campanha não está em envio (status=${c.status}).`);
    return { processed: 0, ok: 0, fail: 0, skipped: 0, done: c.status === "done" };
  }

  const { data: recs } = await db
    .from("campaign_recipients")
    .select(
      "id,contact_id,rendered_message,contacts(id,nome,cidade,bairro,uf,phone_e164,phone_raw,phone_whatsapp_candidate,consentimento_whatsapp,opt_out_at,arquivado_at,lifecycle_status,whatsapp_status,recad_token)",
    )
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .limit(batchSize);

  if (!recs?.length) {
    await db.from("campaigns").update({ status: "done" }).eq("id", campaignId);
    return { processed: 0, ok: 0, fail: 0, skipped: 0, done: true };
  }

  let ok = 0, fail = 0, skipped = 0;
  let shadowbanPaused = false;
  // A própria Z-API já espaça 1-3s entre envios na fila dela; o delay client-side
  // aqui é só o ritmo geral da campanha (reduzido de 3000-8000ms pra permitir
  // campanhas grandes mais rápidas, complementado pelo `delayMessage` por envio).
  const minMs = c.delay_min_ms ?? 1500;
  const maxMs = c.delay_max_ms ?? 4000;

  let mediaUrl: string | null = c.midia_url ?? null;
  if (c.midia_path && !mediaUrl) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed } = await supabaseAdmin.storage.from("campaign-media").createSignedUrl(c.midia_path, 60 * 60);
    mediaUrl = signed?.signedUrl ?? null;
  }

  const linkMeta = c.link_url
    ? {
        url: c.link_url,
        title: c.link_title ?? null,
        description: c.link_description ?? null,
        image: c.link_image ?? null,
        status: (c.link_title || c.link_image ? "preview_confirmada" : "preview_provavel") as
          | "preview_confirmada"
          | "preview_provavel",
      }
    : null;

  const canAttach = !opts.gateAttachmentByTipo || c.tipo === "image" || c.tipo === "document";
  const attachment =
    mediaUrl && c.midia_mime && canAttach
      ? {
          signedUrl: mediaUrl,
          mime: c.tipo === "document" ? (c.midia_mime ?? "application/pdf") : (c.midia_mime ?? "image/jpeg"),
          filename: c.midia_filename ?? "arquivo",
        }
      : null;

  for (const r of recs) {
    const { data: cur } = await db.from("campaigns").select("status").eq("id", campaignId).single();
    if (!cur || cur.status !== "running") break;

    const ct = (r as unknown as { contacts: RecipientContact | null }).contacts;
    // Pré-check de elegibilidade — mantém status "opted_out" com a mesma mensagem
    // usada antes da unificação, para não mudar comportamento visível ao usuário.
    // C2 — pré-check pela regra única; o motivo gravado vem do módulo central.
    const block = ct ? messageBlockReason(ct, { requireConsent: true }) : "sem_telefone";
    if (!ct || block) {
      await db.from("campaign_recipients").update({
        status: "opted_out", failed_at: new Date().toISOString(), erro: BLOCK_LABELS[block],
      }).eq("id", r.id);
      skipped++;
      continue;
    }

    await db.from("campaign_recipients").update({ status: "sending", tentativas: 1 }).eq("id", r.id);

    // Texto para o motor: se a campanha tem anexo tipo imagem sem legenda no corpo
    // renderizado, preserva o midia_caption como fallback (comportamento anterior).
    const bodyText = r.rendered_message ?? c.mensagem_template ?? "";
    const textForSend = bodyText.trim().length === 0 && c.midia_caption ? c.midia_caption : bodyText;

    // Delay adicional (1-15s, doc Z-API) repassado no payload de envio, complementar
    // ao delay client-side entre linhas do lote.
    const delayMessage = Math.floor(2 + Math.random() * 4); // 2-6s

    const result = await sendMessage({
      contact: ct,
      text: textForSend,
      textAlreadyRendered: true,
      link: linkMeta,
      attachment,
      origin: "campaign",
      useSendLink: opts.useSendLink,
      skipValidations: true, // já validamos acima com o skip específico da campanha
      delayMessage,
    });

    if (result.ok) {
      await db.from("campaign_recipients").update({
        status: "sent", sent_at: new Date().toISOString(),
        message_id: result.message_id, zaap_id: result.zaap_id,
        endpoint_used: result.endpoint_used,
        link_url: result.link_url,
        link_title: result.link_title ?? c.link_title ?? null,
        link_description: result.link_description ?? c.link_description ?? null,
        link_image: result.link_image ?? c.link_image ?? null,
        preview_status: result.preview_status,
        rendered_message: result.rendered_text,
        erro: result.fallback_reason,
      } as never).eq("id", r.id);
      await db.from("message_events").insert({
        contact_id: r.contact_id, recipient_id: r.id, tipo: "sent",
        payload: {
          endpoint: result.endpoint_used,
          preview_status: result.preview_status,
          fallback_reason: result.fallback_reason,
          requested_preview: { title: c.link_title, image: c.link_image, description: c.link_description },
          response: { messageId: result.message_id, zaapId: result.zaap_id },
        } as never,
      });
      ok++;
    } else {
      const msg = result.error ?? "erro desconhecido";
      await db.from("campaign_recipients").update({
        status: "failed", failed_at: new Date().toISOString(), erro: msg,
      }).eq("id", r.id);
      fail++;

      // Suspeita de shadowban: para o lote imediatamente, pausa a campanha e
      // avisa o admin (banner na tela /whatsapp) — mais seguro que continuar
      // disparando pro resto do lote com a instância possivelmente restrita.
      if (result.shadowban_suspected) {
        await pauseCampaignForShadowban(db, campaignId);
        shadowbanPaused = true;
        break;
      }
    }

    const delay = Math.floor(minMs + Math.random() * Math.max(0, maxMs - minMs));
    await new Promise((res) => setTimeout(res, delay));
  }

  const { data: agg } = await db
    .from("campaign_recipients").select("status", { count: "exact" }).eq("campaign_id", campaignId);
  if (agg) {
    const counts = { sent: 0, failed: 0, delivered: 0, read: 0 };
    for (const row of agg) {
      const s = (row as { status: string }).status;
      if (s === "sent" || s === "delivered" || s === "read") counts.sent++;
      if (s === "failed") counts.failed++;
      if (s === "delivered" || s === "read") counts.delivered++;
      if (s === "read") counts.read++;
    }
    await db.from("campaigns").update({
      total_enviados: counts.sent, total_falhas: counts.failed,
      total_entregues: counts.delivered, total_lidos: counts.read,
      ultimo_lote_at: new Date().toISOString(),
    }).eq("id", campaignId);
  }

  // Se pausamos por suspeita de shadowban, a campanha fica "paused" mesmo que
  // não sobrem linhas "queued" agora — não deixa o check de "acabou" abaixo
  // reverter isso pra "done".
  if (shadowbanPaused) {
    return { processed: recs.length, ok, fail, skipped, done: false };
  }

  const { count: restantes } = await db
    .from("campaign_recipients").select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId).eq("status", "queued");
  if ((restantes ?? 0) === 0) {
    await db.from("campaigns").update({ status: "done" }).eq("id", campaignId);
    return { processed: recs.length, ok, fail, skipped, done: true };
  }
  return { processed: recs.length, ok, fail, skipped, done: false };
}

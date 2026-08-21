// SERVER-ONLY: loop único de processamento de lote de campanha, compartilhado
// pelo botão manual (campaigns.functions.ts) e pelo cron (campaigns.server.ts).
// As duas chamadas divergiam em `useSendLink` e no critério de anexo — preservados
// aqui como parâmetros explícitos em vez de assumidos iguais.
import { BLOCK_LABELS, messageBlockReason, sendablePhone } from "@/lib/contact-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendMessage, recordWhatsappSendOutcome, buildVarValues, type SendResult } from "@/lib/wa-send.server";
import { extractNamedVars } from "@/lib/whatsapp-templates.functions";

type Client = SupabaseClient<Database>;

const WINDOW_24H_MS = 24 * 60 * 60 * 1000;
const NO_TEMPLATE_REASON = "Fora da janela de 24h e sem template aprovado configurado nesta campanha";

type ApprovedTemplate = {
  name: string;
  language: string;
  body_text: string;
  header_type: string;
  header_text: string | null;
};

function skipResult(rendered: string, reason: string): SendResult {
  return {
    ok: false,
    endpoint_used: "skipped",
    preview_status: "sem_link",
    link_url: null,
    link_title: null,
    link_description: null,
    link_image: null,
    fallback_reason: reason,
    message_id: null,
    zaap_id: null,
    rendered_text: rendered,
    error: reason,
    shadowban_suspected: false,
  };
}

/** Substitui {{nome}} pelos valores resolvidos — só pra manter um registro
 * legível em campaign_recipients.rendered_message, não é o que de fato é
 * enviado (a Meta usa os parâmetros nomeados do template aprovado). */
function previewTemplateBody(bodyText: string, params: Record<string, string>): string {
  return bodyText.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(params, k) ? params[k] : m,
  );
}

/**
 * Envia via template oficial aprovado (única forma aceita pela Meta pra
 * contatos fora da janela de 24h). bodyVars/headerVar já vêm extraídos do
 * template (extractNamedVars), uma vez por lote — não recalculados por contato.
 */
async function sendViaWhatsappTemplate(
  ct: RecipientContact,
  template: ApprovedTemplate,
  bodyVars: string[],
  headerVar: string | undefined,
): Promise<SendResult> {
  const phone = sendablePhone(ct);
  const values = buildVarValues(ct);
  const bodyParams: Record<string, string> = {};
  for (const name of bodyVars) bodyParams[name] = values[name] ?? "";
  const rendered = previewTemplateBody(template.body_text, bodyParams);

  if (!phone) return skipResult(rendered, BLOCK_LABELS.sem_telefone);

  const headerParam = headerVar ? { name: headerVar, value: values[headerVar] ?? "" } : undefined;

  try {
    const { whatsappCloud } = await import("@/integrations/whatsapp-cloud/client.server");
    const res = await whatsappCloud.sendTemplate(
      phone,
      template.name,
      template.language,
      bodyParams,
      headerParam,
    );
    return {
      ok: true,
      endpoint_used: "send-template",
      preview_status: "sem_link",
      link_url: null,
      link_title: null,
      link_description: null,
      link_image: null,
      fallback_reason: null,
      message_id: res.messageId,
      zaap_id: null,
      rendered_text: rendered,
      error: null,
      shadowban_suspected: false,
    };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : "erro desconhecido";
    return {
      ok: false,
      endpoint_used: "send-template",
      preview_status: "sem_link",
      link_url: null,
      link_title: null,
      link_description: null,
      link_image: null,
      fallback_reason: null,
      message_id: null,
      zaap_id: null,
      rendered_text: rendered,
      error: errorMsg,
      shadowban_suspected: false,
    };
  }
}

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

  // Template oficial aprovado da campanha (opcional) — buscado uma vez por lote,
  // não por destinatário. Só usado pra contatos fora da janela de 24h; templates
  // com parameter_format='positional' ficam fora dessa integração por enquanto.
  let approvedTemplate: ApprovedTemplate | null = null;
  let templateBodyVars: string[] = [];
  let templateHeaderVar: string | undefined;
  if (c.whatsapp_template_id) {
    const { data: tpl } = await db
      .from("whatsapp_templates")
      .select("name,language,body_text,header_type,header_text,status,parameter_format")
      .eq("id", c.whatsapp_template_id)
      .eq("status", "approved")
      .eq("parameter_format", "named")
      .maybeSingle();
    if (tpl) {
      approvedTemplate = tpl;
      templateBodyVars = extractNamedVars(tpl.body_text);
      templateHeaderVar =
        tpl.header_type === "TEXT" && tpl.header_text
          ? extractNamedVars(tpl.header_text)[0]
          : undefined;
    }
  }

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
        status: "opted_out", failed_at: new Date().toISOString(), erro: BLOCK_LABELS[block ?? "sem_telefone"],
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

    // Regra da Meta: só dá pra iniciar/reabrir conversa com texto livre dentro
    // da janela de 24h desde a última mensagem recebida do contato. Fora dela,
    // só um template aprovado consegue entregar — senão a Meta rejeitaria mesmo.
    const { data: lastInbound } = await db
      .from("inbound_messages")
      .select("received_at")
      .eq("contact_id", r.contact_id)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const withinWindow = lastInbound
      ? Date.now() - new Date(lastInbound.received_at).getTime() < WINDOW_24H_MS
      : false;

    let result: SendResult;
    if (withinWindow) {
      result = await sendMessage({
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
    } else if (approvedTemplate) {
      result = await sendViaWhatsappTemplate(ct, approvedTemplate, templateBodyVars, templateHeaderVar);
    } else {
      result = skipResult(textForSend, NO_TEMPLATE_REASON);
    }

    await recordWhatsappSendOutcome(r.contact_id, result);

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

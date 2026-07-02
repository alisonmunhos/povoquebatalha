import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["system", "quick_reply"]),
  event_key: z.string().trim().max(80).optional().nullable(),
  shortcut: z.string().trim().max(40).optional().nullable(),
  title: z.string().trim().min(2).max(120),
  category: z.string().trim().max(60).optional().nullable(),
  body: z.string().trim().min(2).max(4000),
  variables: z.array(z.string()).max(20).default([]),
  link: z.string().trim().max(500).optional().nullable(),
  media_url: z.string().trim().max(500).optional().nullable(),
  media_path: z.string().trim().max(500).optional().nullable(),
  media_mime: z.string().trim().max(120).optional().nullable(),
  media_filename: z.string().trim().max(200).optional().nullable(),
  active: z.boolean().default(true),
});

export const listMessageTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("message_templates")
      .select("*")
      .is("archived_at", null)
      .order("kind")
      .order("title");
    if (error) throw error;
    return data ?? [];
  });

export const upsertMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => templateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      kind: data.kind,
      event_key: data.event_key || null,
      shortcut: data.shortcut || null,
      title: data.title,
      category: data.category || null,
      body: data.body,
      variables: data.variables,
      link: data.link || null,
      media_url: data.media_url || null,
      media_path: data.media_path || null,
      media_mime: data.media_mime || null,
      media_filename: data.media_filename || null,
      active: data.active,
      updated_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("message_templates").update(payload).eq("id", data.id).select().single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("message_templates").insert({ ...payload, created_by: context.userId }).select().single();
    if (error) throw error;
    return row;
  });

export const archiveMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_templates")
      .update({ archived_at: new Date().toISOString(), active: false })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const duplicateMessageTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: src, error: e1 } = await context.supabase
      .from("message_templates").select("*").eq("id", data.id).single();
    if (e1) throw e1;
    const s = src as {
      kind: "system" | "quick_reply"; event_key: string | null; shortcut: string | null;
      title: string; category: string | null; body: string; variables: unknown;
      link: string | null; media_url: string | null;
    };
    const { data: row, error } = await context.supabase
      .from("message_templates").insert({
        kind: s.kind,
        // Índice único parcial em event_key para kind='system' impede duplicar mensagem do sistema
        event_key: s.kind === "system" ? null : s.event_key,
        shortcut: s.shortcut,
        title: `${s.title} (cópia)`,
        category: s.category,
        body: s.body,
        variables: (s.variables ?? []) as never,
        link: s.link,
        media_url: s.media_url,
        active: false,
        created_by: context.userId,
        updated_by: context.userId,
      }).select().single();
    if (error) throw error;
    return row;
  });

// Envio de teste — usa Z-API server-side
const testSchema = z.object({
  templateId: z.string().uuid(),
  phone: z.string().trim().min(8).max(40),
});
export const sendTestTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tpl, error } = await supabaseAdmin
      .from("message_templates")
      .select("body, media_path, media_mime, media_filename")
      .eq("id", data.templateId).single();
    if (error || !tpl) throw new Error("Template não encontrado");
    const { data: norm } = await supabaseAdmin.rpc("normalize_phone_br", { input: data.phone });
    const phoneE164 = norm as string | null;
    if (!phoneE164) throw new Error("Telefone inválido");
    const { renderTemplate } = await import("@/lib/automations.server");
    const rendered = renderTemplate(tpl.body, {
      contact: {
        id: "test",
        nome: "Teste",
        phone_e164: phoneE164,
        cidade: null,
        bairro: null,
        recad_token: null,
        consentimento_whatsapp: true,
        opt_out_at: null,
      },
    });
    const phone = phoneE164.replace(/^\+/, "");
    const { zapi } = await import("@/integrations/zapi/client.server");
    // Se houver anexo, envia como imagem/documento com legenda
    if (tpl.media_path) {
      const { data: signed } = await supabaseAdmin
        .storage.from("campaign-media").createSignedUrl(tpl.media_path, 60 * 15);
      if (signed?.signedUrl) {
        const caption = `[TESTE] ${rendered}`;
        if (tpl.media_mime && tpl.media_mime.startsWith("image/")) {
          const res = await zapi.sendImage(phone, signed.signedUrl, caption);
          return { ok: true, id: res.messageId ?? res.zaapId ?? null };
        }
        // PDF/documento: envia texto separado + mensagem sinalizando anexo
        // (Z-API tem endpoint próprio para documento; nesta versão simplificada mandamos como imagem cai em erro
        // então mandamos só o texto com o link assinado embutido para o teste.)
        const res = await zapi.sendText(phone, `${caption}\n\n📎 ${tpl.media_filename ?? "anexo"}: ${signed.signedUrl}`);
        return { ok: true, id: res.messageId ?? res.zaapId ?? res.id ?? null };
      }
    }
    const res = await zapi.sendText(phone, `[TESTE] ${rendered}`);
    return { ok: true, id: res.messageId ?? res.zaapId ?? res.id ?? null };
  });

// Reenvia manualmente uma automação para um contato específico
export const retryAutomationDelivery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ deliveryId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: del, error } = await supabaseAdmin
      .from("automation_deliveries")
      .select("automation_id, contact_id, automation:automations(event_key)")
      .eq("id", data.deliveryId).single();
    if (error || !del) throw new Error("Entrega não encontrada");
    const { data: contact, error: cErr } = await supabaseAdmin
      .from("contacts")
      .select("id, nome, phone_e164, cidade, bairro, recad_token, consentimento_whatsapp, opt_out_at, arquivado_at")
      .eq("id", del.contact_id).single();
    if (cErr || !contact) throw new Error("Contato não encontrado");
    // Zera o registro para permitir novo envio
    await supabaseAdmin.from("automation_deliveries")
      .update({ status: "queued", error: null }).eq("id", data.deliveryId);
    const eventKey = (del.automation as { event_key: string } | null)?.event_key;
    if (!eventKey) throw new Error("Evento da automação não encontrado");
    const { triggerAutomationsForEvent } = await import("@/lib/automations.server");
    await triggerAutomationsForEvent({ eventKey, contact });
    return { ok: true };
  });

// AUTOMATIONS
const automationSchema = z.object({
  id: z.string().uuid().optional(),
  event_key: z.string().trim().min(2).max(80),
  template_id: z.string().uuid(),
  active: z.boolean().default(false),
  delay_seconds: z.number().int().min(0).max(86400).default(0),
  require_consent: z.boolean().default(true),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const listAutomations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("automations")
      .select("*, template:message_templates(id,title,kind,event_key)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const upsertAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => automationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = {
      event_key: data.event_key,
      template_id: data.template_id,
      active: data.active,
      delay_seconds: data.delay_seconds,
      require_consent: data.require_consent,
      notes: data.notes || null,
      updated_by: context.userId,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("automations").update(payload).eq("id", data.id).select().single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("automations").insert({ ...payload, created_by: context.userId }).select().single();
    if (error) throw error;
    return row;
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("automations").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// Histórico de entregas por contato
export const listContactAutomationDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contactId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("automation_deliveries")
      .select("id, status, error, sent_at, created_at, rendered_body, automation:automations(event_key), template:message_templates(title)")
      .eq("contact_id", data.contactId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return rows ?? [];
  });

// Últimas entregas globais (para o painel de automações)
export const listRecentAutomationDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("automation_deliveries")
      .select("id, status, error, sent_at, created_at, contact:contacts(id, nome, phone_e164), automation:automations(event_key), template:message_templates(title)")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });


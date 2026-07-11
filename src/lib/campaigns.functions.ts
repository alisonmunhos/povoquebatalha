import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff } from "@/lib/authz";
import { applyCrmFilters, crmFilterSchema, type CrmFilters } from "@/lib/crm-filters";
import { renderVars } from "@/lib/wa-send.server";

const campaignInput = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().min(1).max(160),
  descricao: z.string().max(500).optional().nullable(),
  tipo: z.enum(["text", "image", "document", "link"]).default("text"),
  mensagem_template: z.string().min(1).max(4000),
  template_id: z.string().uuid().optional().nullable(),
  midia_url: z.string().url().optional().nullable(),
  midia_path: z.string().max(500).optional().nullable(),
  midia_filename: z.string().max(200).optional().nullable(),
  midia_mime: z.string().max(120).optional().nullable(),
  midia_caption: z.string().max(500).optional().nullable(),
  segment_id: z.string().uuid().optional().nullable(),
  filtro_adhoc: crmFilterSchema.partial().optional(),
  audience_ids: z.array(z.string().uuid()).max(20000).optional().nullable(),
  agendado_para: z.string().datetime().optional().nullable(),
  delay_min_ms: z.number().int().min(500).max(60000).default(1500),
  delay_max_ms: z.number().int().min(500).max(120000).default(4000),
  link_url: z.string().url().optional().nullable(),
  link_title: z.string().max(2000).transform(s => s.slice(0,300)).optional().nullable(),
  link_description: z.string().max(4000).transform(s => s.slice(0,600)).optional().nullable(),
  link_image: z.string().url().optional().nullable(),
});

/** Anexa a URL ao final do corpo se ainda não estiver contida (garante prévia no WhatsApp). */
function ensureLinkInBody(body: string, linkUrl: string | null | undefined): string {
  if (!linkUrl) return body;
  if (body.includes(linkUrl)) return body;
  const sep = body.trim().length > 0 ? "\n\n" : "";
  return `${body}${sep}${linkUrl}`;
}

export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select("id,nome,tipo,status,agendado_para,total_destinatarios,total_enviados,total_falhas,total_entregues,total_lidos,created_at,started_at,paused_at,canceled_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return { rows: data ?? [] };
  });

export const getCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c, error } = await context.supabase.from("campaigns").select("*").eq("id", data.id).single();
    if (error) throw error;
    const { data: recs } = await context.supabase
      .from("campaign_recipients")
      .select("id,contact_id,status,rendered_message,erro,sent_at,delivered_at,read_at,failed_at,tentativas,endpoint_used,link_url,preview_status,contacts(nome,phone_e164)")
      .eq("campaign_id", data.id)
      .order("created_at", { ascending: true })
      .limit(500);
    return { campaign: c, recipients: recs ?? [] };
  });

export const upsertCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => campaignInput.parse(d))
  .handler(async ({ data, context }) => {
    const { id, ...payload } = data;
    const row = {
      nome: payload.nome,
      descricao: payload.descricao ?? null,
      tipo: payload.tipo,
      mensagem_template: payload.mensagem_template,
      template_id: payload.template_id ?? null,
      midia_url: payload.midia_url ?? null,
      midia_path: payload.midia_path ?? null,
      midia_filename: payload.midia_filename ?? null,
      midia_mime: payload.midia_mime ?? null,
      midia_caption: payload.midia_caption ?? null,
      segment_id: payload.segment_id ?? null,
      filtro_adhoc: (payload.filtro_adhoc ?? {}) as never,
      audience_ids: (payload.audience_ids ?? null) as never,
      agendado_para: payload.agendado_para ?? null,
      delay_min_ms: payload.delay_min_ms,
      delay_max_ms: payload.delay_max_ms,
      link_url: payload.link_url ?? null,
      link_title: payload.link_title ?? null,
      link_description: payload.link_description ?? null,
      link_image: payload.link_image ?? null,
      created_by: context.userId,
    };
    if (id) {
      const { error } = await context.supabase.from("campaigns").update(row).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: ins, error } = await context.supabase.from("campaigns").insert(row).select("id").single();
    if (error) throw error;
    return { id: ins.id };
  });

export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase.from("campaigns").select("status").eq("id", data.id).single();
    if (!c) throw new Error("Campanha não encontrada");
    if (c.status !== "draft" && c.status !== "canceled") throw new Error("Só é possível excluir campanhas em rascunho ou canceladas.");
    const { error } = await context.supabase.from("campaigns").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const };
  });

// (render de variáveis e escolha de endpoint agora vivem em wa-send.server.ts)


// ============ NOVO: estatísticas de público antes de enviar ============
const audienceInputSchema = z.object({
  ids: z.array(z.string().uuid()).max(20000).optional(),
  filters: crmFilterSchema.partial().optional(),
});

export const getAudienceStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => audienceInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    let ids = data.ids ?? [];
    if (!ids.length && data.filters) {
      let q = context.supabase.from("contacts").select("id").limit(20000);
      q = applyCrmFilters(q as never, data.filters as CrmFilters) as typeof q;
      if (data.filters.tag_ids?.length) {
        const { data: rels } = await context.supabase.from("contact_tags").select("contact_id").in("tag_id", data.filters.tag_ids);
        const relIds = Array.from(new Set((rels ?? []).map((r) => r.contact_id)));
        if (!relIds.length) ids = [];
        else { const { data: rows } = await q.in("id", relIds); ids = (rows ?? []).map((r) => r.id); }
      } else {
        const { data: rows } = await q; ids = (rows ?? []).map((r) => r.id);
      }
    }
    if (!ids.length) {
      return { total: 0, aptos: 0, semConsent: 0, optOut: 0, arquivados: 0, semTelefone: 0, aptosIds: [] as string[], amostra: [] as Array<{ id: string; nome: string | null; nome_social: string | null; phone_e164: string | null; cidade: string | null; bairro: string | null }> };
    }
    const { data: contatos } = await context.supabase
      .from("contacts")
      .select("id,nome,nome_social,phone_e164,cidade,bairro,uf,consentimento_whatsapp,opt_out_at,arquivado_at")
      .in("id", ids);
    let semConsent = 0, optOut = 0, arquivados = 0, semTelefone = 0;
    const aptos: typeof contatos = [];
    for (const c of contatos ?? []) {
      if (c.arquivado_at) { arquivados++; continue; }
      if (c.opt_out_at) { optOut++; continue; }
      if (!c.consentimento_whatsapp) { semConsent++; continue; }
      if (!c.phone_e164) { semTelefone++; continue; }
      aptos.push(c);
    }
    return {
      total: ids.length,
      aptos: aptos.length,
      semConsent, optOut, arquivados, semTelefone,
      aptosIds: aptos.map((c) => c.id),
      amostra: aptos.slice(0, 3).map((c) => ({ id: c.id, nome: c.nome, nome_social: c.nome_social, phone_e164: c.phone_e164, cidade: c.cidade, bairro: c.bairro })),
    };
  });

// ============ NOVO: assinar upload de anexo ============
export const signCampaignMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filename: z.string().trim().min(1).max(200),
    contentType: z.string().trim().min(1).max(120),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const allowed = ["image/png","image/jpeg","image/jpg","image/webp","application/pdf"];
    if (!allowed.includes(data.contentType)) throw new Error("Tipo não permitido. Use PNG, JPG, WEBP ou PDF.");
    const clean = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `${context.userId}/${Date.now()}_${clean}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from("campaign-media").createSignedUploadUrl(path);
    if (error) throw error;
    return { path, token: signed.token, signedUrl: signed.signedUrl, contentType: data.contentType, filename: clean };
  });

// ============ NOVO: criar campanha completa desde a seleção do CRM ============
const createFromSelectionSchema = z.object({
  nome: z.string().trim().min(1).max(160),
  ids: z.array(z.string().uuid()).max(20000).optional(),
  filters: crmFilterSchema.partial().optional(),
  template_id: z.string().uuid().optional().nullable(),
  mensagem_template: z.string().min(1).max(4000),
  tipo: z.enum(["text","image","document","link"]).default("text"),
  midia_path: z.string().max(500).optional().nullable(),
  midia_filename: z.string().max(200).optional().nullable(),
  midia_mime: z.string().max(120).optional().nullable(),
  agendado_para: z.string().datetime().optional().nullable(),
  delay_min_ms: z.number().int().min(500).max(60000).default(1500),
  delay_max_ms: z.number().int().min(500).max(120000).default(4000),
  link_url: z.string().url().optional().nullable(),
  link_title: z.string().max(2000).transform(s => s.slice(0,300)).optional().nullable(),
  link_description: z.string().max(4000).transform(s => s.slice(0,600)).optional().nullable(),
  link_image: z.string().url().optional().nullable(),
  save_as_template: z.object({ title: z.string().trim().min(2).max(120), category: z.string().max(60).optional() }).optional(),
});

export const createCampaignFromSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createFromSelectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    // 1) Resolve audience -> IDs
    let baseIds = data.ids ?? [];
    if (!baseIds.length && data.filters) {
      let q = context.supabase.from("contacts").select("id").limit(20000);
      q = applyCrmFilters(q as never, data.filters as CrmFilters) as typeof q;
      if (data.filters.tag_ids?.length) {
        const { data: rels } = await context.supabase.from("contact_tags").select("contact_id").in("tag_id", data.filters.tag_ids);
        const relIds = Array.from(new Set((rels ?? []).map((r) => r.contact_id)));
        if (relIds.length) { const { data: rows } = await q.in("id", relIds); baseIds = (rows ?? []).map((r) => r.id); }
      } else {
        const { data: rows } = await q; baseIds = (rows ?? []).map((r) => r.id);
      }
    }
    if (!baseIds.length) throw new Error("Nenhum contato no público.");

    // 2) Filter eligibility
    const { data: contatos } = await context.supabase
      .from("contacts")
      .select("id,nome,nome_social,phone_e164,cidade,bairro,uf,consentimento_whatsapp,opt_out_at,arquivado_at")
      .in("id", baseIds);
    const elegiveis = (contatos ?? []).filter((c) => c.consentimento_whatsapp && !c.opt_out_at && !c.arquivado_at && c.phone_e164);
    if (!elegiveis.length) throw new Error("Nenhum contato apto (com consentimento, telefone e sem opt-out/arquivado).");

    // 3) Optionally save as reusable template
    if (data.save_as_template) {
      await context.supabase.from("message_templates").insert({
        kind: "quick_reply",
        title: data.save_as_template.title,
        category: data.save_as_template.category ?? "atualizacao_apoiadores",
        body: data.mensagem_template,
        variables: [],
        active: true,
        created_by: context.userId,
        updated_by: context.userId,
      });
    }

    // 4) Create campaign
    const { data: ins, error } = await context.supabase.from("campaigns").insert({
      nome: data.nome,
      tipo: data.tipo,
      mensagem_template: data.mensagem_template,
      template_id: data.template_id ?? null,
      midia_path: data.midia_path ?? null,
      midia_filename: data.midia_filename ?? null,
      midia_mime: data.midia_mime ?? null,
      audience_ids: elegiveis.map((c) => c.id) as never,
      agendado_para: data.agendado_para ?? null,
      delay_min_ms: data.delay_min_ms,
      delay_max_ms: data.delay_max_ms,
      link_url: data.link_url ?? null,
      link_title: data.link_title ?? null,
      link_description: data.link_description ?? null,
      link_image: data.link_image ?? null,
      status: data.agendado_para ? "scheduled" : "draft",
      total_destinatarios: elegiveis.length,
      created_by: context.userId,
    }).select("id").single();
    if (error) throw error;

    // 5) Create queued recipients with rendered messages (com link ao final quando houver)
    const rows = elegiveis.map((c) => ({
      campaign_id: ins.id, contact_id: c.id,
      rendered_message: ensureLinkInBody(renderVars(data.mensagem_template, c), data.link_url),
      status: "queued" as const,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: e2 } = await context.supabase.from("campaign_recipients").insert(chunk);
      if (e2) throw e2;
    }

    const ignorados = baseIds.length - elegiveis.length;
    return { id: ins.id, total: elegiveis.length, ignorados };
  });

export const previewCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c, error } = await context.supabase.from("campaigns").select("*").eq("id", data.id).single();
    if (error || !c) throw error ?? new Error("Não encontrada");

    let contactsQuery = context.supabase
      .from("contacts")
      .select("id,nome,nome_social,cidade,bairro,uf,phone_e164,consentimento_whatsapp,opt_out_at,arquivado_at,lifecycle_status", { count: "exact" });

    if (c.audience_ids && Array.isArray(c.audience_ids) && (c.audience_ids as unknown[]).length) {
      contactsQuery = contactsQuery.in("id", c.audience_ids as string[]);
    } else if (c.segment_id) {
      const { data: seg } = await context.supabase.from("segments").select("tipo,filtro,member_ids").eq("id", c.segment_id).single();
      if (seg?.tipo === "estatico") {
        const ids = (seg.member_ids as string[]) ?? [];
        contactsQuery = contactsQuery.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      } else if (seg?.filtro) {
        contactsQuery = applyCrmFilters(contactsQuery as never, seg.filtro as CrmFilters) as typeof contactsQuery;
      }
    } else if (c.filtro_adhoc && Object.keys(c.filtro_adhoc as object).length) {
      contactsQuery = applyCrmFilters(contactsQuery as never, c.filtro_adhoc as CrmFilters) as typeof contactsQuery;
    } else {
      return { totalBruto: 0, elegíveis: 0, semConsent: 0, optOut: 0, arquivados: 0, semTelefone: 0, exemplos: [], mensagemExemplo: c.mensagem_template };
    }

    const { data: all, count } = await contactsQuery.limit(20000);
    let semConsent = 0, optOut = 0, arquivados = 0, semTelefone = 0;
    const elegiveis: NonNullable<typeof all> = [];
    for (const r of all ?? []) {
      if (r.arquivado_at) { arquivados++; continue; }
      if (r.opt_out_at) { optOut++; continue; }
      if (!r.consentimento_whatsapp) { semConsent++; continue; }
      if (!r.phone_e164) { semTelefone++; continue; }
      elegiveis.push(r);
    }
    const exemplos = elegiveis.slice(0, 3).map((r) => ({
      nome: r.nome, cidade: r.cidade, phone: r.phone_e164,
      preview: ensureLinkInBody(renderVars(c.mensagem_template, r), c.link_url),
    }));

    return {
      totalBruto: count ?? (all?.length ?? 0),
      elegíveis: elegiveis.length,
      semConsent, optOut, arquivados, semTelefone,
      exemplos,
      mensagemExemplo: exemplos[0]?.preview ?? c.mensagem_template,
    };
  });

async function buildAudienceIds(context: { supabase: import("@supabase/supabase-js").SupabaseClient }, campaign: {
  segment_id: string | null;
  filtro_adhoc: unknown;
  audience_ids?: unknown;
}): Promise<string[]> {
  if (campaign.audience_ids && Array.isArray(campaign.audience_ids) && (campaign.audience_ids as unknown[]).length) {
    return campaign.audience_ids as string[];
  }
  if (campaign.segment_id) {
    const { data: seg } = await context.supabase.from("segments").select("tipo,filtro,member_ids").eq("id", campaign.segment_id).single();
    if (!seg) return [];
    if (seg.tipo === "estatico") return (seg.member_ids as string[]) ?? [];
    let q = context.supabase.from("contacts").select("id");
    q = applyCrmFilters(q as never, (seg.filtro ?? {}) as CrmFilters) as typeof q;
    const { data } = await q.limit(20000);
    return (data ?? []).map((r) => r.id);
  }
  if (campaign.filtro_adhoc && Object.keys(campaign.filtro_adhoc as object).length) {
    let q = context.supabase.from("contacts").select("id");
    q = applyCrmFilters(q as never, campaign.filtro_adhoc as CrmFilters) as typeof q;
    const { data } = await q.limit(20000);
    return (data ?? []).map((r) => r.id);
  }
  return [];
}

export const prepareCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase.from("campaigns").select("*").eq("id", data.id).single();
    if (!c) return { ok: false as const, total: 0, ignorados: 0, message: "Campanha não encontrada." };
    if (!["draft", "scheduled", "paused"].includes(c.status)) {
      return { ok: false as const, total: 0, ignorados: 0, message: "Campanha em andamento ou finalizada — não pode ser reprocessada." };
    }

    const audience = await buildAudienceIds(context, c);
    if (!audience.length) return { ok: false as const, total: 0, ignorados: 0, message: "Público vazio — nenhum contato corresponde aos filtros." };

    const { data: contatos } = await context.supabase
      .from("contacts")
      .select("id,nome,nome_social,phone_e164,cidade,bairro,uf,consentimento_whatsapp,opt_out_at,arquivado_at")
      .in("id", audience.slice(0, 20000));

    const elegiveis = (contatos ?? []).filter((c2) =>
      c2.consentimento_whatsapp === true && !c2.opt_out_at && !c2.arquivado_at && c2.phone_e164,
    );

    await context.supabase.from("campaign_recipients").delete().eq("campaign_id", data.id);

    const rows = elegiveis.map((c2) => ({
      campaign_id: data.id, contact_id: c2.id,
      rendered_message: ensureLinkInBody(renderVars(c.mensagem_template, c2), c.link_url),
      status: "queued" as const,
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await context.supabase.from("campaign_recipients").insert(chunk);
      if (error) throw error;
    }

    await context.supabase.from("campaigns").update({
      total_destinatarios: rows.length,
      status: c.agendado_para ? "scheduled" : "draft",
    }).eq("id", data.id);

    return { ok: true as const, total: rows.length, ignorados: (contatos?.length ?? 0) - rows.length, message: null };
  });

export const startCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").update({
      status: "running", started_at: new Date().toISOString(), paused_at: null, paused_motivo: null,
    }).eq("id", data.id).in("status", ["draft", "scheduled", "paused"]);
    if (error) throw error;
    return { ok: true as const };
  });

export const pauseCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("campaigns").update({
      status: "paused", paused_at: new Date().toISOString(),
    }).eq("id", data.id).eq("status", "running");
    if (error) throw error;
    return { ok: true as const };
  });

export const cancelCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), motivo: z.string().max(500).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { error } = await context.supabase.from("campaigns").update({
      status: "canceled", canceled_at: now, canceled_by: context.userId, canceled_motivo: data.motivo ?? null,
    }).eq("id", data.id).in("status", ["running", "paused", "scheduled", "draft"]);
    if (error) throw error;
    await context.supabase.from("campaign_recipients").update({ status: "canceled" })
      .eq("campaign_id", data.id).in("status", ["queued", "sending"]);
    return { ok: true as const };
  });

export const processCampaignBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), batchSize: z.number().int().min(1).max(50).default(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { processCampaignBatchShared } = await import("@/lib/campaign-batch.server");
    // Comportamento anterior preservado: botão manual sempre prioriza /send-link
    // quando há metadados OG, e não restringe anexo pelo tipo da campanha.
    return processCampaignBatchShared(context.supabase, data.id, data.batchSize, {
      useSendLink: true,
      gateAttachmentByTipo: false,
      throwIfNotRunning: true,
    });
  });

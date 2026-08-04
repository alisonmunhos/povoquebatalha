import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff } from "@/lib/authz";
import { audienceInputSchema, campaignInput, createFromSelectionSchema } from "@/lib/campaigns.schemas";

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
    let preparedAudience: Awaited<ReturnType<typeof import("@/lib/campaign-audience.server")["resolveAudience"]>> | null = null;
    if (!id && payload.segment_id) {
      const { resolveAudience } = await import("@/lib/campaign-audience.server");
      preparedAudience = await resolveAudience(context.supabase, { segmentId: payload.segment_id });
      if (!preparedAudience.eligible.length) {
        throw new Error("Este segmento não tem contatos aptos para receber a campanha.");
      }
    }
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
      audience_ids: (preparedAudience?.eligible.map((contact) => contact.id) ?? payload.audience_ids ?? null) as never,
      agendado_para: payload.agendado_para ?? null,
      delay_min_ms: payload.delay_min_ms,
      delay_max_ms: payload.delay_max_ms,
      link_url: payload.link_url ?? null,
      link_title: payload.link_title ?? null,
      link_description: payload.link_description ?? null,
      link_image: payload.link_image ?? null,
      total_destinatarios: preparedAudience?.eligible.length ?? 0,
      created_by: context.userId,
    };
    if (id) {
      const { error } = await context.supabase.from("campaigns").update(row).eq("id", id);
      if (error) throw error;
      return { id };
    }
    const { data: ins, error } = await context.supabase.from("campaigns").insert(row).select("id").single();
    if (error) throw error;
    if (preparedAudience) {
      const { replaceCampaignRecipients } = await import("@/lib/campaign-audience.server");
      await replaceCampaignRecipients(
        context.supabase,
        { id: ins.id, mensagem_template: payload.mensagem_template, link_url: payload.link_url },
        preparedAudience.eligible,
      );
    }
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

export const getAudienceStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => audienceInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { bestPhone } = await import("@/lib/contact-rules");
    const { resolveAudience } = await import("@/lib/campaign-audience.server");
    const source = data.ids?.length ? { ids: data.ids } as const : data.filters ? { filters: data.filters } as const : null;
    if (!source) {
      return { total: 0, aptos: 0, semConsent: 0, optOut: 0, arquivados: 0, semTelefone: 0, whatsappIndisponivel: 0, motivos: null as null | Record<string, number>, aptosIds: [] as string[], amostra: [] as Array<{ id: string; nome: string | null; nome_social: string | null; phone_e164: string | null; cidade: string | null; bairro: string | null }> };
    }
    const audience = await resolveAudience(context.supabase, source);
    return {
      total: audience.ids.length,
      existentes: audience.contacts.length,
      inexistentes: audience.missing,
      aptos: audience.eligible.length,
      semConsent: audience.reasons.sem_consentimento,
      optOut: audience.reasons.opt_out,
      arquivados: audience.reasons.arquivado + audience.reasons.nao_enviar,
      semTelefone: audience.reasons.sem_telefone,
      whatsappIndisponivel: audience.reasons.whatsapp_indisponivel,
      motivos: audience.reasons,
      aptosIds: audience.eligible.map((contact) => contact.id),
      amostra: audience.eligible.slice(0, 3).map((contact) => {
        return { id: contact.id, nome: contact.nome, nome_social: contact.nome_social, phone_e164: bestPhone(contact), cidade: contact.cidade, bairro: contact.bairro };
      }),
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

export const createCampaignFromSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createFromSelectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { replaceCampaignRecipients, resolveAudience } = await import("@/lib/campaign-audience.server");
    const source = data.ids?.length ? { ids: data.ids } as const : data.filters ? { filters: data.filters } as const : null;
    if (!source) throw new Error("Nenhum contato no público.");
    const audience = await resolveAudience(context.supabase, source);
    if (!audience.eligible.length) throw new Error("Nenhum contato apto (com consentimento, telefone e sem opt-out/arquivado).");

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
      audience_ids: audience.eligible.map((contact) => contact.id) as never,
      agendado_para: data.agendado_para ?? null,
      delay_min_ms: data.delay_min_ms,
      delay_max_ms: data.delay_max_ms,
      link_url: data.link_url ?? null,
      link_title: data.link_title ?? null,
      link_description: data.link_description ?? null,
      link_image: data.link_image ?? null,
      status: data.agendado_para ? "scheduled" : "draft",
      total_destinatarios: audience.eligible.length,
      created_by: context.userId,
    }).select("id").single();
    if (error) throw error;

    await replaceCampaignRecipients(
      context.supabase,
      { id: ins.id, mensagem_template: data.mensagem_template, link_url: data.link_url },
      audience.eligible,
    );
    return { id: ins.id, total: audience.eligible.length, ignorados: audience.ids.length - audience.eligible.length };
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
      if (r.arquivado_at || r.lifecycle_status === "nao_enviar") { arquivados++; continue; }
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
      .select("id,nome,nome_social,phone_e164,phone_whatsapp_candidate,phone_raw,cidade,bairro,uf,consentimento_whatsapp,opt_out_at,arquivado_at,lifecycle_status,whatsapp_status")
      .in("id", audience.slice(0, 20000));

    const elegiveis = (contatos ?? []).filter((c2) => canReceiveMessage(c2, { requireConsent: true }));

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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Overview KPIs
export const getRelacionamentoOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const cnt = async (fn: () => Promise<{ count: number | null }>) => (await fn()).count ?? 0;

    const [aptos, enviados, respostas, erros, optouts, semResposta, ultimaCampanha] = await Promise.all([
      cnt(async () => await s.from("contacts").select("id", { count: "exact", head: true })
        .eq("consentimento_whatsapp", true).is("opt_out_at", null).is("arquivado_at", null)
        .not("phone_whatsapp_candidate", "is", null) as unknown as Promise<{ count: number | null }>),
      cnt(async () => await s.from("campaign_recipients").select("id", { count: "exact", head: true })
        .not("sent_at", "is", null) as unknown as Promise<{ count: number | null }>),
      cnt(async () => await s.from("inbound_messages").select("id", { count: "exact", head: true }) as unknown as Promise<{ count: number | null }>),
      cnt(async () => await s.from("campaign_recipients").select("id", { count: "exact", head: true })
        .eq("status", "erro") as unknown as Promise<{ count: number | null }>),
      cnt(async () => await s.from("contacts").select("id", { count: "exact", head: true })
        .not("opt_out_at", "is", null) as unknown as Promise<{ count: number | null }>),
      cnt(async () => await s.from("contacts").select("id", { count: "exact", head: true })
        .eq("consentimento_whatsapp", true).is("opt_out_at", null) as unknown as Promise<{ count: number | null }>),
      s.from("campaigns").select("id, nome, started_at, status").not("started_at", "is", null)
        .order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    return {
      aptos,
      enviados,
      respostas,
      erros,
      optouts,
      sem_resposta_aptos: Math.max(0, semResposta - respostas),
      recuperaveis: erros,
      ultima_campanha: ultimaCampanha.data,
    };
  });

// List templates as filter options (only those that were used or currently active)
export const listMessageFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tpls } = await context.supabase
      .from("message_templates")
      .select("id,title,kind,category")
      .is("archived_at", null)
      .eq("active", true)
      .order("title");
    const { data: camps } = await context.supabase
      .from("campaigns")
      .select("id,nome,started_at,status,template_id")
      .order("created_at", { ascending: false }).limit(200);
    return { templates: tpls ?? [], campaigns: camps ?? [] };
  });

// Per-message / per-campaign recipients query
export const listRecipientsByFilter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    template_id: z.string().uuid().optional(),
    campaign_id: z.string().uuid().optional(),
    status: z.array(z.string()).optional(),
    responded: z.boolean().optional(),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("campaign_recipients")
      .select("id,status,sent_at,delivered_at,read_at,failed_at,erro,rendered_message,campaign_id,contact_id,campaigns:campaign_id(id,nome,template_id),contacts:contact_id(id,nome,phone_e164,cidade,bairro,uf,opt_out_at)")
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);

    if (data.campaign_id) q = q.eq("campaign_id", data.campaign_id);
    if (data.status && data.status.length > 0) q = q.in("status", data.status);

    const { data: rows, error } = await q;
    if (error) throw error;

    let filtered = rows ?? [];
    if (data.template_id) {
      filtered = filtered.filter((r) => {
        const c = Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns;
        return c?.template_id === data.template_id;
      });
    }

    // Respondents: contacts with inbound after sent
    let responded = new Set<string>();
    if (data.responded !== undefined) {
      const contactIds = filtered.map((r) => r.contact_id).filter(Boolean);
      if (contactIds.length > 0) {
        const { data: inbounds } = await context.supabase
          .from("inbound_messages")
          .select("contact_id")
          .in("contact_id", contactIds as string[]);
        responded = new Set((inbounds ?? []).map((i) => i.contact_id).filter(Boolean) as string[]);
      }
      filtered = filtered.filter((r) => data.responded ? responded.has(r.contact_id as string) : !responded.has(r.contact_id as string));
    } else {
      const contactIds = filtered.map((r) => r.contact_id).filter(Boolean);
      if (contactIds.length > 0) {
        const { data: inbounds } = await context.supabase
          .from("inbound_messages")
          .select("contact_id")
          .in("contact_id", contactIds as string[]);
        responded = new Set((inbounds ?? []).map((i) => i.contact_id).filter(Boolean) as string[]);
      }
    }

    return filtered.map((r) => {
      const c = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      const camp = Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns;
      return {
        id: r.id,
        status: r.status,
        sent_at: r.sent_at,
        delivered_at: r.delivered_at,
        read_at: r.read_at,
        failed_at: r.failed_at,
        erro: r.erro,
        campaign_id: r.campaign_id,
        campaign_name: camp?.nome ?? null,
        contact_id: r.contact_id,
        nome: c?.nome ?? null,
        phone: c?.phone_e164 ?? null,
        cidade: c?.cidade ?? null,
        bairro: c?.bairro ?? null,
        uf: c?.uf ?? null,
        opt_out: Boolean(c?.opt_out_at),
        respondeu: responded.has(r.contact_id as string),
      };
    });
  });

// Campaign summary (per campaign aggregation)
export const listCampaignSummaries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("campaigns")
      .select("id,nome,status,started_at,template_id,total_destinatarios,total_enviados,total_entregues,total_lidos,total_falhas")
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    return data ?? [];
  });

// Curated lists (Recuperação + Engajados + Problemas)
export const getCuratedList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: z.enum([
      "erro_recente", "sem_atualizacao", "sem_resposta_longa", "consentimento_sem_campanha", "aptos_reenvio",
      "responderam_recente", "formas_ajuda_marcadas", "panfletagem", "adesivar_carro", "plaquinha", "receber_material", "movimento_social",
      "opt_out", "bloqueados", "telefone_invalido", "arquivados", "sem_consentimento",
    ]),
    limit: z.number().int().max(500).default(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = context.supabase;
    let q = s.from("contacts").select("id,nome,phone_e164,cidade,bairro,uf,consentimento_whatsapp,opt_out_at,arquivado_at,whatsapp_status,formas_ajuda,lifecycle_status,updated_at").limit(data.limit);

    switch (data.kind) {
      case "opt_out": q = q.not("opt_out_at", "is", null); break;
      case "bloqueados": q = q.eq("whatsapp_status", "bloqueado"); break;
      case "telefone_invalido": q = q.eq("whatsapp_status", "invalido"); break;
      case "arquivados": q = q.not("arquivado_at", "is", null); break;
      case "sem_consentimento": q = q.or("consentimento_whatsapp.is.null,consentimento_whatsapp.eq.false").is("arquivado_at", null); break;
      case "sem_atualizacao": q = q.eq("lifecycle_status", "importado_aguardando_recadastro").is("arquivado_at", null); break;
      case "aptos_reenvio": q = q.eq("consentimento_whatsapp", true).is("opt_out_at", null).is("arquivado_at", null).not("phone_whatsapp_candidate", "is", null); break;
      case "consentimento_sem_campanha": q = q.eq("consentimento_whatsapp", true).is("opt_out_at", null).is("arquivado_at", null); break;
      case "formas_ajuda_marcadas": q = q.not("formas_ajuda", "eq", "[]").is("arquivado_at", null); break;
      case "panfletagem": q = q.contains("formas_ajuda", ["panfletagem_banquinha"]); break;
      case "adesivar_carro": q = q.contains("formas_ajuda", ["adesivar_carro"]); break;
      case "plaquinha": q = q.contains("formas_ajuda", ["plaquinha_casa"]); break;
      case "receber_material": q = q.contains("formas_ajuda", ["receber_panfletos"]); break;
      case "movimento_social": q = q.eq("participa_movimento_social" as never, true); break;
      case "erro_recente": {
        const { data: errs } = await s.from("campaign_recipients").select("contact_id").eq("status", "erro").limit(1000);
        const ids = Array.from(new Set((errs ?? []).map((e) => e.contact_id).filter(Boolean))) as string[];
        if (ids.length === 0) return [];
        q = q.in("id", ids);
        break;
      }
      case "responderam_recente": {
        const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const { data: ib } = await s.from("inbound_messages").select("contact_id").gte("received_at", since).limit(1000);
        const ids = Array.from(new Set((ib ?? []).map((r) => r.contact_id).filter(Boolean))) as string[];
        if (ids.length === 0) return [];
        q = q.in("id", ids);
        break;
      }
      case "sem_resposta_longa": {
        const { data: ib } = await s.from("inbound_messages").select("contact_id").limit(5000);
        const withResp = new Set((ib ?? []).map((r) => r.contact_id).filter(Boolean) as string[]);
        const { data: allC } = await s.from("contacts")
          .select("id,nome,phone_e164,cidade,bairro,uf,consentimento_whatsapp,opt_out_at,arquivado_at,whatsapp_status,formas_ajuda,lifecycle_status,updated_at")
          .eq("consentimento_whatsapp", true).is("opt_out_at", null).is("arquivado_at", null).limit(data.limit);
        return (allC ?? []).filter((c) => !withResp.has(c.id));
      }
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

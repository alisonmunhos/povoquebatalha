// Server functions dos Fluxos de cadastro pelo chat do WhatsApp.
// Leitura: equipe interna / acesso ao Inbox. Escrita: administradores.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, requireStaff } from "@/lib/authz";

const FLOW_SELECT =
  "id,nome,descricao,opening_message,closing_message,active,priority,allow_update_existing,trigger_keywords,trigger_on_ad,trigger_ad_ids,trigger_on_first_contact,created_at,updated_at";
const STEP_SELECT =
  "id,flow_id,order_index,catalog_field_key,prompt,required,response_kind,options,kind,path_key,option_routes";

const responseKind = z.enum([
  "text",
  "single_choice",
  "multi_choice",
  "yes_no",
  "address",
  "email",
  "date",
  "number",
]);

const stepInput = z.object({
  id: z.string().uuid().optional(),
  catalog_field_key: z.string().trim().min(1),
  prompt: z.string().trim().min(1).max(1000),
  required: z.boolean(),
  response_kind: responseKind,
  kind: z.enum(["question", "menu", "handoff", "finish"]).default("question"),
  path_key: z.string().trim().min(1).max(60).default("principal"),
  option_routes: z.record(z.string(), z.string()).default({}),
  options: z
    .array(z.object({ value: z.string().trim().min(1), label: z.string().trim().min(1) }))
    .default([]),
});


const flowInput = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2).max(120),
  descricao: z.string().trim().max(500).nullable().default(null),
  opening_message: z.string().trim().min(1).max(1000),
  closing_message: z.string().trim().min(1).max(1000),
  active: z.boolean(),
  priority: z.number().int().min(0).max(100),
  allow_update_existing: z.boolean(),
  trigger_keywords: z.array(z.string().trim().min(1).max(60)).default([]),
  trigger_on_ad: z.boolean(),
  trigger_ad_ids: z.array(z.string().trim().min(1).max(80)).default([]),
  trigger_on_first_contact: z.boolean(),
  steps: z.array(stepInput).default([]),
});

export const listWhatsappFlows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireStaff(supabase, userId);

    const [{ data: flows }, { data: steps }, { data: sessions }] = await Promise.all([
      supabase.from("whatsapp_flows").select(FLOW_SELECT).order("priority", { ascending: false }),
      supabase.from("whatsapp_flow_steps").select(STEP_SELECT).order("order_index", { ascending: true }),
      supabase
        .from("whatsapp_flow_sessions")
        .select("id,flow_id,phone,status,current_step_index,contact_id,created_at,completed_at")
        .order("created_at", { ascending: false })
        .limit(80),
    ]);

    return {
      flows: flows ?? [],
      steps: steps ?? [],
      sessions: sessions ?? [],
    };
  });

export const saveWhatsappFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => flowInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, "Só administradores podem criar ou editar fluxos.");

    const { steps, id, ...flowFields } = data;

    let flowId = id ?? null;
    if (flowId) {
      const { error } = await supabase.from("whatsapp_flows").update(flowFields).eq("id", flowId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabase
        .from("whatsapp_flows")
        .insert({ ...flowFields, created_by: userId })
        .select("id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "Falha ao criar o fluxo.");
      flowId = created.id;
    }

    // Substitui o roteiro inteiro: a tela sempre envia a lista completa e ordenada.
    const keepIds = steps.map((s) => s.id).filter(Boolean) as string[];
    let del = supabase.from("whatsapp_flow_steps").delete().eq("flow_id", flowId);
    if (keepIds.length) del = del.not("id", "in", `(${keepIds.join(",")})`);
    await del;

    for (const [index, step] of steps.entries()) {
      const payload = {
        flow_id: flowId,
        order_index: index,
        catalog_field_key: step.catalog_field_key,
        prompt: step.prompt,
        required: step.required,
        response_kind: step.response_kind,
        options: step.options,
        kind: step.kind,
        path_key: step.path_key,
        option_routes: step.option_routes,

      if (step.id) {
        const { error } = await supabase.from("whatsapp_flow_steps").update(payload).eq("id", step.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("whatsapp_flow_steps").insert(payload);
        if (error) throw new Error(error.message);
      }
    }

    return { id: flowId };
  });

export const deleteWhatsappFlow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, "Só administradores podem apagar fluxos.");
    const { error } = await supabase.from("whatsapp_flows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setWhatsappFlowActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, "Só administradores podem ligar ou desligar fluxos.");
    const { error } = await supabase
      .from("whatsapp_flows")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Dispara um fluxo manualmente para um número (teste com o próprio WhatsApp).
 * A pessoa precisa ter mandado mensagem para o número da campanha nas últimas
 * 24h — regra da Meta para texto livre.
 */
export const startWhatsappFlowManually = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ flow_id: z.string().uuid(), phone: z.string().trim().min(8).max(30) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, "Só administradores podem disparar fluxos manualmente.");

    const { normalizePhoneBR } = await import("@/lib/phone");
    const e164 = normalizePhoneBR(data.phone);
    if (!e164) throw new Error("Número inválido. Escreva com DDD, ex.: 51 99890-2337.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { matchInboundContactId } = await import("@/lib/inbound-contact-match.server");
    const { startFlowManually } = await import("@/lib/whatsapp-flow.server");

    const contactId = await matchInboundContactId(e164);
    await startFlowManually({
      admin: supabaseAdmin as never,
      flowId: data.flow_id,
      phone: e164.replace(/\D+/g, ""),
      contactId,
    });
    return { ok: true, phone: e164 };
  });

/**
 * Lista quem mandou mensagem nas últimas 24h (janela da Meta para texto livre),
 * com nome do cadastro (quando existir) e situação atual no fluxo.
 */
export const listFlowEligibleRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, "Só administradores podem disparar fluxos.");

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: inbound } = await supabase
      .from("inbound_messages")
      .select("from_phone, conteudo, received_at, contact_id")
      .gte("received_at", cutoff)
      .order("received_at", { ascending: false })
      .limit(1000);

    type Row = {
      phone: string;
      last_message: string | null;
      last_at: string;
      contact_id: string | null;
      nome: string | null;
      cidade: string | null;
      session_status: string | null;
      session_step: number | null;
    };
    const byPhone = new Map<string, Row>();
    for (const m of inbound ?? []) {
      const phone = (m.from_phone ?? "").replace(/\D+/g, "");
      if (!phone || byPhone.has(phone)) continue;
      byPhone.set(phone, {
        phone,
        last_message: m.conteudo ?? null,
        last_at: m.received_at,
        contact_id: m.contact_id ?? null,
        nome: null,
        cidade: null,
        session_status: null,
        session_step: null,
      });
    }
    const rows = [...byPhone.values()];
    if (!rows.length) return { recipients: [] as Row[] };

    const contactIds = rows.map((r) => r.contact_id).filter(Boolean) as string[];
    if (contactIds.length) {
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id, nome, nome_social, cidade")
        .in("id", contactIds);
      const map = new Map((contacts ?? []).map((c) => [c.id, c]));
      for (const r of rows) {
        const c = r.contact_id ? map.get(r.contact_id) : null;
        if (c) {
          r.nome = c.nome_social ?? c.nome ?? null;
          r.cidade = c.cidade ?? null;
        }
      }
    }

    const { data: sessions } = await supabase
      .from("whatsapp_flow_sessions")
      .select("phone, status, current_step_index, created_at")
      .in("phone", rows.map((r) => r.phone))
      .order("created_at", { ascending: false });
    const seen = new Set<string>();
    for (const s of sessions ?? []) {
      const phone = (s.phone ?? "").replace(/\D+/g, "");
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      const row = byPhone.get(phone);
      if (row) {
        row.session_status = s.status ?? null;
        row.session_step = s.current_step_index ?? null;
      }
    }

    return { recipients: rows };
  });

/** Dispara o fluxo para vários números de uma vez (máx. 200 por chamada). */
export const startWhatsappFlowForMany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        flow_id: z.string().uuid(),
        phones: z.array(z.string().trim().min(8).max(30)).min(1).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId, "Só administradores podem disparar fluxos.");

    const { normalizePhoneBR } = await import("@/lib/phone");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { matchInboundContactId } = await import("@/lib/inbound-contact-match.server");
    const { startFlowManually } = await import("@/lib/whatsapp-flow.server");

    let enviados = 0;
    const falhas: { phone: string; motivo: string }[] = [];

    for (const raw of data.phones) {
      const e164 = normalizePhoneBR(raw);
      if (!e164) {
        falhas.push({ phone: raw, motivo: "Número inválido (precisa de DDD)." });
        continue;
      }
      try {
        const digits = e164.replace(/\D+/g, "");
        const contactId = await matchInboundContactId(e164);
        await startFlowManually({
          admin: supabaseAdmin as never,
          flowId: data.flow_id,
          phone: digits,
          contactId,
        });
        enviados += 1;
      } catch (e) {
        falhas.push({ phone: raw, motivo: e instanceof Error ? e.message : "Falha no envio." });
      }
    }

    return { enviados, falhas };
  });

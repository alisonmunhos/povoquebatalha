import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ConvEventPayload = Record<string, string | number | boolean | null>;

// ------- List conversations (WhatsApp Web style: only contacts with exchanged messages) -------
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filter: z.enum(["all", "mine", "unread", "flagged", "resolved"]).default("all"),
    search: z.string().trim().max(120).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("conversations")
      .select("id, contact_id, status, assigned_to, last_message_at, last_message_preview, last_message_direction, unread_count, flagged, contacts:contact_id(id,nome,phone_e164,cidade,uf,bairro,opt_out_at,whatsapp_status)")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500);

    if (data.filter === "resolved") q = q.eq("status", "resolvida");
    else q = q.in("status", ["aberta", "aguardando"]);

    if (data.filter === "mine") q = q.eq("assigned_to", context.userId);
    if (data.filter === "unread") q = q.gt("unread_count", 0);
    if (data.filter === "flagged") q = q.eq("flagged", true);

    const { data: rows, error } = await q;
    if (error) throw error;

    type ContactShape = { id: string; nome: string | null; phone_e164: string | null; cidade: string | null; uf: string | null; bairro: string | null; opt_out_at: string | null; whatsapp_status: string | null };
    let list = (rows ?? []).map((r) => {
      const raw = r.contacts as ContactShape | ContactShape[] | null;
      const c = Array.isArray(raw) ? raw[0] : raw;
      return {
        id: r.id as string,
        contact_id: r.contact_id as string,
        nome: c?.nome ?? null,
        phone: c?.phone_e164 ?? null,
        cidade: c?.cidade ?? null,
        uf: c?.uf ?? null,
        bairro: c?.bairro ?? null,
        opt_out: Boolean(c?.opt_out_at),
        whatsapp_status: c?.whatsapp_status ?? null,
        status: r.status as "aberta" | "aguardando" | "resolvida",
        assigned_to: r.assigned_to as string | null,
        last_at: r.last_message_at as string | null,
        last_preview: r.last_message_preview as string | null,
        last_dir: r.last_message_direction as "in" | "out" | null,
        unread: r.unread_count as number,
        flagged: r.flagged as boolean,
      };
    });

    if (data.search) {
      const s = data.search.toLowerCase();
      list = list.filter((c) =>
        (c.nome ?? "").toLowerCase().includes(s) ||
        (c.phone ?? "").toLowerCase().includes(s) ||
        (c.last_preview ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  });

// Contatos com WhatsApp válido que ainda NÃO têm conversa — usado para iniciar novo chat pela busca.
export const searchContactsForNewChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const digits = data.q.replace(/\D+/g, "");
    let q = context.supabase
      .from("contacts")
      .select("id, nome, phone_e164, cidade, uf, whatsapp_status")
      .in("whatsapp_status", ["confirmado", "desconhecido"])
      .is("opt_out_at", null)
      .is("arquivado_at", null)
      .limit(30);

    if (digits.length >= 4) {
      q = q.or(`phone_e164.ilike.%${digits}%,phone_digits.ilike.%${digits}%,nome.ilike.%${data.q}%`);
    } else {
      q = q.ilike("nome", `%${data.q}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    const ids = (rows ?? []).map((r) => r.id as string);
    if (ids.length === 0) return [];
    const { data: existing } = await context.supabase
      .from("conversations").select("contact_id").in("contact_id", ids);
    const withConv = new Set((existing ?? []).map((e) => e.contact_id as string));
    return (rows ?? [])
      .filter((r) => !withConv.has(r.id as string))
      .slice(0, 20)
      .map((r) => ({
        id: r.id as string,
        nome: r.nome as string | null,
        phone: r.phone_e164 as string | null,
        cidade: r.cidade as string | null,
        uf: r.uf as string | null,
      }));
  });

// ------- Load unified conversation thread -------
export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contact_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: convRow } = await context.supabase
      .from("conversations")
      .select("id, status, assigned_to, unread_count, flagged, last_message_at")
      .eq("contact_id", data.contact_id).maybeSingle();

    const { data: contact } = await context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,phone_whatsapp_candidate,cidade,uf,bairro,opt_out_at,consentimento_whatsapp,whatsapp_status")
      .eq("id", data.contact_id).maybeSingle();

    const [{ data: inbound }, { data: direct }, { data: campaign }] = await Promise.all([
      context.supabase
        .from("inbound_messages")
        .select("id, conteudo, tipo, received_at, read_at")
        .eq("contact_id", data.contact_id).order("received_at", { ascending: true }).limit(500),
      context.supabase
        .from("direct_messages")
        .select("id, conteudo, created_at, sent_by, origem, status, erro")
        .eq("contact_id", data.contact_id).order("created_at", { ascending: true }).limit(500),
      context.supabase
        .from("campaign_recipients")
        .select("id, rendered_message, sent_at, status, campaigns:campaign_id(nome)")
        .eq("contact_id", data.contact_id).not("sent_at", "is", null).order("sent_at", { ascending: true }).limit(200),
    ]);

    const senderIds = Array.from(new Set((direct ?? []).map((d) => d.sent_by).filter((x): x is string => Boolean(x))));
    const senderNames: Record<string, string> = {};
    if (senderIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles").select("id, full_name").in("id", senderIds);
      (profs ?? []).forEach((p) => { senderNames[p.id as string] = (p.full_name as string | null) ?? "Usuário"; });
    }

    let events: Array<{ id: string; created_at: string; actor_id: string | null; actor_name: string | null; event_type: string; payload: ConvEventPayload }> = [];
    if (convRow?.id) {
      const { data: evts } = await context.supabase
        .from("conversation_events")
        .select("id, actor_id, event_type, payload, created_at")
        .eq("conversation_id", convRow.id).order("created_at", { ascending: false }).limit(100);
      const actorIds = Array.from(new Set((evts ?? []).map((e) => e.actor_id).filter((x): x is string => Boolean(x))));
      const actorNames: Record<string, string> = {};
      if (actorIds.length > 0) {
        const { data: profs } = await context.supabase
          .from("profiles").select("id, full_name").in("id", actorIds);
        (profs ?? []).forEach((p) => { actorNames[p.id as string] = (p.full_name as string | null) ?? "Usuário"; });
      }
      events = (evts ?? []).map((e) => ({
        id: e.id as string,
        actor_id: e.actor_id as string | null,
        actor_name: e.actor_id ? (actorNames[e.actor_id as string] ?? null) : null,
        event_type: e.event_type as string,
        payload: (e.payload ?? {}) as ConvEventPayload,
        created_at: e.created_at as string,
      }));
    }

    return {
      conversation: convRow,
      contact,
      inbound: inbound ?? [],
      direct: (direct ?? []).map((d) => ({ ...d, sender_name: d.sent_by ? senderNames[d.sent_by as string] ?? null : null })),
      campaign: (campaign ?? []).map((r) => ({
        id: r.id as string,
        rendered_message: r.rendered_message as string | null,
        sent_at: r.sent_at as string | null,
        status: r.status as string,
        campaign_name: (Array.isArray(r.campaigns) ? r.campaigns[0]?.nome : (r.campaigns as { nome?: string } | null)?.nome) ?? null,
      })),
      events,
    };
  });

// Mark conversation read (zera unread + marca inbound_messages)
export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ contact_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("inbound_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("contact_id", data.contact_id).is("read_at", null);
    await context.supabase.from("conversations").update({ unread_count: 0 }).eq("contact_id", data.contact_id);
    return { ok: true };
  });

export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    assigned_to: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("conversations")
      .update({ assigned_to: data.assigned_to }).eq("id", data.conversation_id);
    if (error) throw error;
    const payload: ConvEventPayload = { assigned_to: data.assigned_to };
    await context.supabase.from("conversation_events").insert({
      conversation_id: data.conversation_id,
      actor_id: context.userId,
      event_type: data.assigned_to ? "assigned" : "unassigned",
      payload,
    });
    return { ok: true };
  });

export const setConversationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    status: z.enum(["aberta", "aguardando", "resolvida"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: prev } = await context.supabase.from("conversations").select("status, contact_id").eq("id", data.conversation_id).single();
    const { error } = await context.supabase.from("conversations")
      .update({ status: data.status }).eq("id", data.conversation_id);
    if (error) throw error;
    const payload: ConvEventPayload = { from: prev?.status ?? null, to: data.status };
    await context.supabase.from("conversation_events").insert({
      conversation_id: data.conversation_id,
      actor_id: context.userId,
      event_type: "status_changed",
      payload,
    });
    if (data.status === "resolvida" && prev?.contact_id) {
      await context.supabase.from("inbound_messages")
        .update({ resolved_at: new Date().toISOString(), resolved_by: context.userId })
        .eq("contact_id", prev.contact_id).is("resolved_at", null);
    }
    return { ok: true };
  });

export const toggleConversationFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ conversation_id: z.string().uuid(), flagged: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("conversations")
      .update({ flagged: data.flagged }).eq("id", data.conversation_id);
    if (error) throw error;
    await context.supabase.from("conversation_events").insert({
      conversation_id: data.conversation_id,
      actor_id: context.userId,
      event_type: data.flagged ? "flagged" : "unflagged",
      payload: {},
    });
    return { ok: true };
  });

export const addConversationNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
    mention_user_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const payload: ConvEventPayload = { body: data.body, mention_user_id: data.mention_user_id ?? null };
    const { error } = await context.supabase.from("conversation_events").insert({
      conversation_id: data.conversation_id,
      actor_id: context.userId,
      event_type: "note",
      payload,
    });
    if (error) throw error;
    if (data.mention_user_id) {
      const mentionPayload: ConvEventPayload = { mentioned: data.mention_user_id, snippet: data.body.slice(0, 200) };
      await context.supabase.from("conversation_events").insert({
        conversation_id: data.conversation_id,
        actor_id: context.userId,
        event_type: "mention",
        payload: mentionPayload,
      });
    }
    return { ok: true };
  });

export const listCommunicationStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["admin", "operador", "vrm", "comunicacao"]);
    if (error) throw error;
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id as string)));
    if (ids.length === 0) return [];
    const { data: profs } = await context.supabase
      .from("profiles").select("id, full_name, status").in("id", ids);
    const byId = new Map<string, { id: string; name: string; status: string | null }>();
    (profs ?? []).forEach((p) => {
      byId.set(p.id as string, {
        id: p.id as string,
        name: (p.full_name as string | null) ?? "Usuário",
        status: p.status as string | null,
      });
    });
    const roleById = new Map<string, string>();
    (roles ?? []).forEach((r) => {
      const cur = roleById.get(r.user_id as string);
      if (!cur || r.role === "admin") roleById.set(r.user_id as string, r.role as string);
    });
    return ids
      .map((id) => {
        const p = byId.get(id);
        if (!p || p.status === "revoked" || p.status === "suspended") return null;
        return { id, name: p.name, role: roleById.get(id) ?? "comunicacao" };
      })
      .filter((x): x is { id: string; name: string; role: string } => x !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

// Badge global — quantas conversas atribuídas a mim ainda têm mensagens não lidas
export const getMyCommunicationBadge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [mineUnread, totalUnread] = await Promise.all([
      context.supabase.from("conversations").select("id", { count: "exact", head: true })
        .eq("assigned_to", context.userId).gt("unread_count", 0).neq("status", "resolvida"),
      context.supabase.from("conversations").select("id", { count: "exact", head: true })
        .gt("unread_count", 0).neq("status", "resolvida"),
    ]);
    return {
      mine_unread: mineUnread.count ?? 0,
      total_unread: totalUnread.count ?? 0,
    };
  });

// Read-only contacts list para o módulo (apenas WhatsApp validado, sem opt-out)
export const listCommContactsForBulk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    search: z.string().trim().max(120).optional(),
    limit: z.number().int().min(1).max(500).default(200),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contacts")
      .select("id, nome, phone_e164, cidade, uf, bairro, whatsapp_status, consentimento_whatsapp")
      .in("whatsapp_status", ["confirmado", "desconhecido"])
      .is("opt_out_at", null)
      .is("arquivado_at", null)
      .order("nome", { ascending: true })
      .limit(data.limit);
    if (data.search) {
      const s = data.search;
      const digits = s.replace(/\D+/g, "");
      q = digits.length >= 4
        ? q.or(`nome.ilike.%${s}%,phone_e164.ilike.%${digits}%,cidade.ilike.%${s}%,bairro.ilike.%${s}%`)
        : q.or(`nome.ilike.%${s}%,cidade.ilike.%${s}%,bairro.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

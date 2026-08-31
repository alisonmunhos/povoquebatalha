import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireRole, requireInboxAccess } from "@/lib/authz";
import { renderMessageVars } from "@/lib/message-vars";
import { WINDOW_MS, EXPIRING_MS, windowState } from "@/lib/inbox-window";
import type { TemplateButton } from "@/lib/whatsapp-templates.functions";


type ConvEventPayload = Record<string, string | number | boolean | null>;

// automations não tem coluna de nome amigável, só event_key (chave técnica,
// ex.: "formulario:seja-um-apoiador-..."). Formata levemente pra exibição na
// bolha ("automação · Formulario seja um apoiador..."); se ficar comprido
// demais pra caber num rótulo curto, omite o nome (só "automação").
function formatEventKeyLabel(eventKey: string | null | undefined): string | null {
  if (!eventKey) return null;
  const words = eventKey.replace(/[:\-_]+/g, " ").trim();
  if (!words || words.length > 60) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

type ConversationContactShape = {
  id: string;
  nome: string | null;
  phone_e164: string | null;
  cidade: string | null;
  uf: string | null;
  bairro: string | null;
  opt_out_at: string | null;
  whatsapp_status: string | null;
};

const CONVERSATION_LIST_COLS =
  "id, contact_id, from_phone, status, assigned_to, last_message_at, last_inbound_at, last_message_preview, last_message_direction, unread_count, flagged, contacts:contact_id(id,nome,phone_e164,cidade,uf,bairro,opt_out_at,whatsapp_status)";

type ConversationListRow = {
  id: string;
  contact_id: string | null;
  from_phone: string | null;
  status: "aberta" | "aguardando" | "resolvida";
  assigned_to: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_message_preview: string | null;
  last_message_direction: "in" | "out" | null;
  unread_count: number;
  flagged: boolean;
  contacts: ConversationContactShape | ConversationContactShape[] | null;
};

function mapConversationRow(
  r: ConversationListRow,
  assigneeMap: Map<string, { id: string; nome: string | null }>,
) {
  const raw = r.contacts;
  const c = Array.isArray(raw) ? raw[0] : raw;
  const assignedTo = r.assigned_to;
  return {
    id: r.id,
    contact_id: r.contact_id,
    from_phone: r.from_phone ?? null,
    nome: c?.nome ?? null,
    phone: c?.phone_e164 ?? r.from_phone ?? null,
    cidade: c?.cidade ?? null,
    uf: c?.uf ?? null,
    bairro: c?.bairro ?? null,
    opt_out: Boolean(c?.opt_out_at),
    whatsapp_status: c?.whatsapp_status ?? null,
    status: r.status,
    assigned_to: assignedTo,
    assignee: assignedTo ? (assigneeMap.get(assignedTo) ?? { id: assignedTo, nome: null }) : null,
    last_at: r.last_message_at,
    last_inbound_at: r.last_inbound_at ?? null,
    last_preview: r.last_message_preview,
    last_dir: r.last_message_direction,
    unread: r.unread_count,
    flagged: r.flagged,
  };
}

type MappedConversation = ReturnType<typeof mapConversationRow>;

async function resolveAssignees(
  supabase: Parameters<typeof requireInboxAccess>[0],
  rows: { assigned_to: string | null }[],
): Promise<Map<string, { id: string; nome: string | null }>> {
  const assigneeIds = Array.from(
    new Set(rows.map((r) => r.assigned_to).filter((x): x is string => Boolean(x))),
  );
  const assigneeMap = new Map<string, { id: string; nome: string | null }>();
  if (assigneeIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", assigneeIds)
      .limit(1000);
    (profs ?? []).forEach((p) => {
      assigneeMap.set(p.id as string, { id: p.id as string, nome: p.full_name as string | null });
    });
  }
  return assigneeMap;
}

// Não existe coluna dizendo "a última saída foi um disparo de campanha" — os 3
// gatilhos que mantêm conversations.last_message_at (direct/automação/campanha)
// copiam o timestamp de origem verbatim, então dá pra descobrir a origem
// comparando contact_id + timestamp exato contra campaign_recipients.sent_at,
// sem precisar de coluna nova nem backfill (funciona igual pra conversas
// antigas e novas).
async function classifyCampaignOrigin(
  supabase: Parameters<typeof requireInboxAccess>[0],
  candidates: Pick<MappedConversation, "contact_id" | "last_at" | "last_dir">[],
): Promise<Set<string>> {
  const outCandidates = candidates.filter((c) => c.last_dir === "out" && c.contact_id && c.last_at);
  if (outCandidates.length === 0) return new Set();
  const contactIds = Array.from(new Set(outCandidates.map((c) => c.contact_id as string)));
  const { data: sent } = await supabase
    .from("campaign_recipients")
    .select("contact_id, sent_at")
    .in("contact_id", contactIds)
    .not("sent_at", "is", null)
    .limit(10000);
  const sentByContact = new Map<string, Set<string>>();
  for (const r of sent ?? []) {
    const cid = r.contact_id as string;
    const at = r.sent_at as string;
    if (!sentByContact.has(cid)) sentByContact.set(cid, new Set());
    sentByContact.get(cid)!.add(at);
  }
  const result = new Set<string>();
  for (const c of outCandidates) {
    if (sentByContact.get(c.contact_id as string)?.has(c.last_at as string)) {
      result.add(c.contact_id as string);
    }
  }
  return result;
}

const INBOX_SORTS = ["ultima_interacao", "expira_primeiro", "aguardando_resposta"] as const;
type InboxSort = (typeof INBOX_SORTS)[number];

function sortConversations(list: MappedConversation[], sort: InboxSort): MappedConversation[] {
  if (sort === "expira_primeiro") {
    return [...list].sort((a, b) => {
      if (a.last_inbound_at === null) return b.last_inbound_at === null ? 0 : 1;
      if (b.last_inbound_at === null) return -1;
      return a.last_inbound_at.localeCompare(b.last_inbound_at);
    });
  }
  if (sort === "aguardando_resposta") {
    return [...list].sort((a, b) => {
      const aWaiting = a.last_dir === "in" && a.status !== "resolvida";
      const bWaiting = b.last_dir === "in" && b.status !== "resolvida";
      if (aWaiting !== bWaiting) return aWaiting ? -1 : 1;
      return (b.last_at ?? "").localeCompare(a.last_at ?? "");
    });
  }
  return [...list].sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
}

const INBOX_CHIPS = [
  "todas",
  "aberta",
  "aguardando",
  "resolvida",
  "sinalizada",
  "chat_disponivel",
  "expirando",
  "minhas",
  "ultimo_disparo",
] as const;
type InboxChip = (typeof INBOX_CHIPS)[number];

// Recorte (chip) da Etapa 2 do Inbox — arquitetura nova, separada da
// ordenação (sortConversations). Busca o conjunto candidato inteiro (até
// CANDIDATE_CAP) em vez de paginar direto no banco: "aberta" e
// "ultimo_disparo" dependem de uma classificação feita em JS
// (classifyCampaignOrigin, sem coluna própria pra origem) que não dá pra
// aplicar como filtro SQL — paginar em cima do candidato completo já
// classificado/ordenado é o jeito de manter a contagem e a lista sempre
// consistentes entre si (nunca divergem, porque vêm do mesmo array).
const CANDIDATE_CAP = 5000;

async function runListConversationsV2(
  data: { filter: InboxChip; sort: InboxSort; search?: string; offset: number; limit: number },
  context: { supabase: Parameters<typeof requireInboxAccess>[0]; userId: string },
) {
  await requireInboxAccess(context.supabase, context.userId);
  const nowMs = Date.now();
  const windowCutoff = new Date(nowMs - WINDOW_MS).toISOString();
  const expiringCutoff = new Date(nowMs + EXPIRING_MS - WINDOW_MS).toISOString();

  let q = context.supabase
    .from("conversations")
    .select(CONVERSATION_LIST_COLS)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(CANDIDATE_CAP);

  if (data.filter === "aberta") q = q.eq("status", "aberta");
  else if (data.filter === "aguardando") q = q.eq("status", "aguardando");
  else if (data.filter === "resolvida") q = q.eq("status", "resolvida");
  else if (data.filter === "sinalizada") q = q.eq("flagged", true);
  else if (data.filter === "minhas")
    q = q.eq("assigned_to", context.userId).in("status", ["aberta", "aguardando"]);
  else if (data.filter === "ultimo_disparo") q = q.eq("last_message_direction", "out");

  if (data.filter === "chat_disponivel" || data.filter === "expirando") {
    q = q.gt("last_inbound_at", windowCutoff);
  }
  if (data.filter === "expirando") q = q.lte("last_inbound_at", expiringCutoff);

  if (data.search) {
    const s = data.search;
    const digits = s.replace(/\D+/g, "");
    const phoneOr =
      digits.length >= 4
        ? `contacts.phone_e164.ilike.%${digits}%,contacts.nome.ilike.%${s}%`
        : `contacts.nome.ilike.%${s}%`;
    q = q.or(`${phoneOr},last_message_preview.ilike.%${s}%`);
  }

  const { data: rawRows, error } = await q;
  if (error) throw error;
  const rows = (rawRows ?? []) as unknown as ConversationListRow[];
  const capped = rows.length >= CANDIDATE_CAP;

  const assigneeMap = await resolveAssignees(context.supabase, rows);
  let mapped = rows.map((r) => mapConversationRow(r, assigneeMap));

  if (data.filter === "aberta" || data.filter === "ultimo_disparo") {
    const campaignSet = await classifyCampaignOrigin(context.supabase, mapped);
    mapped =
      data.filter === "ultimo_disparo"
        ? mapped.filter((c) => c.contact_id && campaignSet.has(c.contact_id))
        : mapped.filter((c) => !(c.contact_id && campaignSet.has(c.contact_id)));
  }

  mapped = sortConversations(mapped, data.sort);

  const total = mapped.length;
  const list = mapped.slice(data.offset, data.offset + data.limit);
  const hasMore = data.offset + data.limit < total;

  return { list, total, has_more: hasMore, capped };
}

// Chips novos da Etapa 2 (reforma do Inbox) — função própria, separada de
// listConversations (mantida intacta por compatibilidade com
// src/components/inbox-astryx/AstryxInbox.tsx, UI alternativa que também a
// consome). Tipo de retorno próprio evita a ambiguidade de união que dava se
// os dois formatos de resposta saíssem da mesma função.
export const listConversationsV2 = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filter: z.enum(INBOX_CHIPS),
        sort: z.enum(INBOX_SORTS).default("ultima_interacao"),
        search: z.string().trim().max(120).optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(20).max(200).default(60),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => runListConversationsV2(data, context));

// ------- List conversations (WhatsApp Web style: only contacts with exchanged messages) -------
export const listConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filter: z.enum([
      "all", "mine", "unread", "flagged", "resolved",
      "in_service", "unlinked", "with_error", "opt_out",
      // Janela de 24h da Meta (texto livre liberado)
      "window_open", "window_expiring", "mine_window",
    ]).default("all"),
    search: z.string().trim().max(120).optional(),
    // Rolagem incremental: quantas conversas carregar nesta leva.
    limit: z.number().int().min(20).max(1000).default(60),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    // Pede uma linha extra para saber se ainda existem conversas além desta leva.
    const pageSize = data.limit;
    const nowMs = Date.now();
    const windowCutoff = new Date(nowMs - WINDOW_MS).toISOString();
    const expiringCutoff = new Date(nowMs + EXPIRING_MS - WINDOW_MS).toISOString();
    const isWindowFilter = data.filter === "window_open" || data.filter === "window_expiring" || data.filter === "mine_window";

    let q = context.supabase
      .from("conversations")
      .select("id, contact_id, from_phone, status, assigned_to, last_message_at, last_inbound_at, last_message_preview, last_message_direction, unread_count, flagged, contacts:contact_id(id,nome,phone_e164,cidade,uf,bairro,opt_out_at,whatsapp_status)")
      .limit(pageSize + 1);

    // Nas filas de janela, o que fecha primeiro vem primeiro.
    q = isWindowFilter
      ? q.order("last_inbound_at", { ascending: true, nullsFirst: false })
      : q.order("last_message_at", { ascending: false, nullsFirst: false });

    if (data.filter === "resolved") q = q.eq("status", "resolvida");
    else q = q.in("status", ["aberta", "aguardando"]);

    if (data.filter === "mine") q = q.eq("assigned_to", context.userId);
    if (data.filter === "unread") q = q.gt("unread_count", 0);
    if (data.filter === "flagged") q = q.eq("flagged", true);
    if (data.filter === "in_service") q = q.not("assigned_to", "is", null);
    if (data.filter === "unlinked") q = q.is("contact_id", null);
    if (isWindowFilter) q = q.gt("last_inbound_at", windowCutoff);
    if (data.filter === "window_expiring") q = q.lte("last_inbound_at", expiringCutoff);
    if (data.filter === "mine_window") q = q.eq("assigned_to", context.userId);

    if (data.search) {
      const s = data.search;
      const digits = s.replace(/\D+/g, "");
      // Busca no nome/telefone do contato e no preview da última mensagem.
      const phoneOr = digits.length >= 4
        ? `contacts.phone_e164.ilike.%${digits}%,contacts.nome.ilike.%${s}%`
        : `contacts.nome.ilike.%${s}%`;
      q = q.or(`${phoneOr},last_message_preview.ilike.%${s}%`);
    }

    const { data: allRows, error } = await q;
    if (error) throw error;
    const hasMore = (allRows ?? []).length > pageSize;
    const rows = (allRows ?? []).slice(0, pageSize);

    type ContactShape = { id: string; nome: string | null; phone_e164: string | null; cidade: string | null; uf: string | null; bairro: string | null; opt_out_at: string | null; whatsapp_status: string | null };

    // Resolve nomes dos responsáveis em uma única query secundária (assigned_to não é FK formal).
    const assigneeIds = Array.from(new Set((rows ?? []).map((r) => r.assigned_to as string | null).filter((x): x is string => Boolean(x))));
    let assigneeMap = new Map<string, { id: string; nome: string | null }>();
    if (assigneeIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", assigneeIds)
        .limit(1000);
      (profs ?? []).forEach((p) => {
        assigneeMap.set(p.id as string, { id: p.id as string, nome: p.full_name as string | null });
      });
    }

    let list = (rows ?? []).map((r) => {
      const raw = r.contacts as ContactShape | ContactShape[] | null;
      const c = Array.isArray(raw) ? raw[0] : raw;
      const assignedTo = r.assigned_to as string | null;
      return {
        id: r.id as string,
        contact_id: r.contact_id as string | null,
        from_phone: (r as { from_phone?: string | null }).from_phone ?? null,
        nome: c?.nome ?? null,
        phone: c?.phone_e164 ?? (r as { from_phone?: string | null }).from_phone ?? null,
        cidade: c?.cidade ?? null,
        uf: c?.uf ?? null,
        bairro: c?.bairro ?? null,
        opt_out: Boolean(c?.opt_out_at),
        whatsapp_status: c?.whatsapp_status ?? null,
        status: r.status as "aberta" | "aguardando" | "resolvida",
        assigned_to: assignedTo,
        assignee: assignedTo ? (assigneeMap.get(assignedTo) ?? { id: assignedTo, nome: null }) : null,
        last_at: r.last_message_at as string | null,
        last_inbound_at: (r as { last_inbound_at?: string | null }).last_inbound_at ?? null,
        last_preview: r.last_message_preview as string | null,
        last_dir: r.last_message_direction as "in" | "out" | null,
        unread: r.unread_count as number,
        flagged: r.flagged as boolean,
      };
    });

    // Filtros que exigem cruzamento local
    if (data.filter === "opt_out") list = list.filter((c) => c.opt_out);
    if (data.filter === "with_error") {
      const contactIds = list.map((l) => l.contact_id).filter((x): x is string => Boolean(x));
      if (contactIds.length > 0) {
        const { data: err } = await context.supabase
          .from("direct_messages").select("contact_id").eq("status", "erro").in("contact_id", contactIds).limit(1000);
        const set = new Set((err ?? []).map((e) => e.contact_id as string));
        list = list.filter((l) => l.contact_id && set.has(l.contact_id));
      } else {
        list = [];
      }
    }

    // Contagens reais para os chips de filtro (uma única query agregada).
    const { data: countsRows } = await context.supabase
      .from("conversations")
      .select("status, unread_count, flagged, assigned_to, contact_id, last_inbound_at")
      .in("status", ["aberta", "aguardando", "resolvida"]);

    const counts = {
      nao_lidas: 0,
      abertas: 0,
      aguardando: 0,
      resolvidas: 0,
      sinalizadas: 0,
      janela_aberta: 0,
      janela_expirando: 0,
      minhas_janela: 0,
      minhas: 0,
    };
    for (const r of countsRows ?? []) {
      const ativa = r.status === "aberta" || r.status === "aguardando";
      if ((r.unread_count ?? 0) > 0) counts.nao_lidas++;
      if (r.status === "aberta") counts.abertas++;
      if (r.status === "aguardando") counts.aguardando++;
      if (r.status === "resolvida") counts.resolvidas++;
      if (r.flagged) counts.sinalizadas++;
      const mine = r.assigned_to === context.userId;
      if (mine && ativa) counts.minhas++;
      if (!ativa) continue;
      const w = windowState(r.last_inbound_at as string | null, nowMs);
      if (w.open) {
        counts.janela_aberta++;
        if (w.expiring) counts.janela_expirando++;
        if (mine) counts.minhas_janela++;
      }
    }


    return { list, counts, has_more: hasMore };
  });

// Faixa fixa "Dentro da janela agora" — quem mandou mensagem nas últimas 24h,
// qualquer status (inclusive resolvida), sempre visível independente do
// chip/ordenação escolhidos na lista principal. Naturalmente pequeno — sem
// paginação, só um teto de segurança.
export const listWindowOpenPinned = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireInboxAccess(context.supabase, context.userId);
    const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data: rawRows, error } = await context.supabase
      .from("conversations")
      .select(CONVERSATION_LIST_COLS)
      .is("archived_at", null)
      .gt("last_inbound_at", cutoff)
      .order("last_inbound_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    const rows = (rawRows ?? []) as unknown as ConversationListRow[];
    const assigneeMap = await resolveAssignees(context.supabase, rows);
    return rows.map((r) => mapConversationRow(r, assigneeMap));
  });

// Opt-out + arquivar, direto do Inbox: some da lista (archived_at) e bloqueia
// novos envios (contacts.opt_out_at), numa ação só. Reaproveita a mesma
// gravação de setOptOut (contacts.functions.ts) em vez de chamá-la — mantém
// o handler autocontido, no mesmo padrão de escrita direta via
// context.supabase já usado no resto deste arquivo.
export const archiveAndOptOutConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        conversation_id: z.string().uuid(),
        contact_id: z.string().uuid(),
        motivo: z.string().trim().max(240).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireInboxAccess(context.supabase, context.userId);

    const { error: contactError } = await context.supabase
      .from("contacts")
      .update({
        opt_out_at: new Date().toISOString(),
        opt_out_motivo: data.motivo ?? null,
        lifecycle_status: "nao_enviar",
      })
      .eq("id", data.contact_id);
    if (contactError) throw contactError;

    await context.supabase.from("contact_audit_log").insert({
      contact_id: data.contact_id,
      user_id: context.userId,
      action: "opt_out",
      changes: (data.motivo
        ? { motivo: data.motivo, origem: "inbox" }
        : { origem: "inbox" }) as never,
    });

    const { error: convError } = await context.supabase
      .from("conversations")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.conversation_id);
    if (convError) throw convError;

    await context.supabase.from("conversation_events").insert({
      conversation_id: data.conversation_id,
      actor_id: context.userId,
      event_type: "archived",
      payload: (data.motivo ? { motivo: data.motivo } : {}) as ConvEventPayload,
    });

    return { ok: true as const };
  });

// Busca de contatos salvos (estilo WhatsApp): retorna QUALQUER contato ativo
// que bata com nome/telefone/cidade, independente de status do WhatsApp.
// Contatos que já tenham conversa também podem aparecer; a UI decide como agrupar.
export const searchContactsForNewChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contacts")
      .select("id, nome, phone_e164, cidade, uf, whatsapp_status")
      .is("opt_out_at", null)
      .is("arquivado_at", null)
      .order("nome", { ascending: true })
      .limit(30);
    const digits = data.q.replace(/\D+/g, "");
    if (digits.length >= 4) {
      q = q.or(`phone_e164.ilike.%${digits}%,phone_digits.ilike.%${digits}%,nome.ilike.%${data.q}%,cidade.ilike.%${data.q}%`);
    } else {
      q = q.or(`nome.ilike.%${data.q}%,cidade.ilike.%${data.q}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id as string,
      nome: r.nome as string | null,
      phone: (r.phone_e164 as string | null) ?? null,
      cidade: r.cidade as string | null,
      uf: r.uf as string | null,
    }));
  });


// ------- Load unified conversation thread -------
export const getConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contact_id: z.string().uuid().optional(),
    conversation_id: z.string().uuid().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    type ConvRow = {
      id: string; contact_id: string | null; from_phone: string | null;
      status: string; assigned_to: string | null; unread_count: number; flagged: boolean; last_message_at: string | null;
      last_inbound_at: string | null;
      first_message_direction: "in" | "out" | null;
      last_message_preview: string | null; last_message_direction: "in" | "out" | null;
    };
    const CONV_COLS =
      "id, contact_id, from_phone, status, assigned_to, unread_count, flagged, last_message_at, last_inbound_at, first_message_direction, last_message_preview, last_message_direction";
    let convRow: ConvRow | null = null;
    if (data.conversation_id) {
      const { data: c } = await context.supabase
        .from("conversations")
        .select(CONV_COLS)
        .eq("id", data.conversation_id).maybeSingle();
      convRow = (c as ConvRow | null) ?? null;
    } else if (data.contact_id) {
      const { data: c } = await context.supabase
        .from("conversations")
        .select(CONV_COLS)
        .eq("contact_id", data.contact_id).maybeSingle();
      convRow = (c as ConvRow | null) ?? null;
    }

    const effectiveContactId = data.contact_id ?? convRow?.contact_id ?? null;

    type Contact = {
      id: string;
      nome: string | null;
      phone_e164: string | null;
      phone_whatsapp_candidate: string | null;
      cidade: string | null;
      uf: string | null;
      bairro: string | null;
      opt_out_at: string | null;
      consentimento_whatsapp: boolean | null;
      whatsapp_status: string | null;
      profissao: string | null;
      formas_ajuda: string[] | null;
      endereco_completo: string | null;
      observacoes: string | null;
    };
    let contact: Contact | null = null;
    if (effectiveContactId) {
      const { data: c } = await context.supabase
        .from("contacts")
        .select(
          "id,nome,phone_e164,phone_whatsapp_candidate,cidade,uf,bairro,opt_out_at,consentimento_whatsapp,whatsapp_status,profissao,formas_ajuda,endereco_completo,observacoes",
        )
        .eq("id", effectiveContactId).maybeSingle();
      contact = c as Contact | null;
    }

    const INBOUND_COLS =
      "id, conteudo, tipo, received_at, read_at, media_url, media_path, media_mime, media_filename, media_size, wa_message_id, reply_to_wa_id, reaction_emoji, reaction_target_wa_id, latitude, longitude, location_name, shared_contacts, is_system_event";

    // Recupera histórico mesmo quando a vinculação entre mensagem e contato
    // divergiu (período anterior à API oficial, 9º dígito, DDI, etc.).
    let inboundQuery = null;
    if (effectiveContactId) {
      const phoneFilter = contact?.phone_e164 ? `,from_phone.eq.${encodeURIComponent(contact.phone_e164)}` : "";
      inboundQuery = context.supabase.from("inbound_messages")
        .select(INBOUND_COLS)
        .or(`contact_id.eq.${effectiveContactId}${phoneFilter}`)
        .order("received_at", { ascending: true }).limit(500);
    } else if (convRow?.from_phone) {
      const { data: matched } = await context.supabase
        .from("contacts")
        .select("id")
        .eq("phone_e164", convRow.from_phone)
        .limit(1);
      const matchedId = matched?.[0]?.id as string | undefined;
      const orParts = [`from_phone.eq.${encodeURIComponent(convRow.from_phone)}`];
      if (matchedId) orParts.push(`contact_id.eq.${matchedId}`);
      inboundQuery = context.supabase.from("inbound_messages")
        .select(INBOUND_COLS)
        .or(orParts.join(","))
        .order("received_at", { ascending: true }).limit(500);
    }

    const DIRECT_COLS =
      "id, conteudo, created_at, sent_by, origem, status, erro, delivered_at, read_at, failed_at, media_path, media_mime, media_filename, message_id, endpoint_used, link_url, link_title, link_description, link_image, reaction_emoji, reaction_target_wa_id";

    // Mensagens do robô de cadastro podem ter sido gravadas só com o número
    // (quando o contato ainda não existia): busca também por to_phone.
    let directQuery = null;
    if (effectiveContactId) {
      const phoneOr = contact?.phone_e164
        ? `,to_phone.eq.${encodeURIComponent(contact.phone_e164.replace(/\D+/g, ""))}`
        : "";
      directQuery = context.supabase.from("direct_messages")
        .select(DIRECT_COLS)
        .or(`contact_id.eq.${effectiveContactId}${phoneOr}`)
        .order("created_at", { ascending: true }).limit(500);
    } else if (convRow?.from_phone) {
      directQuery = context.supabase.from("direct_messages")
        .select(DIRECT_COLS)
        .eq("to_phone", convRow.from_phone.replace(/\D+/g, ""))
        .order("created_at", { ascending: true }).limit(500);
    }


    const campaignQuery = effectiveContactId
      ? context.supabase.from("campaign_recipients")
          .select("id, rendered_message, sent_at, status, endpoint_used, message_id, link_url, link_title, link_description, link_image, campaigns:campaign_id(nome, whatsapp_template_id, whatsapp_templates:whatsapp_template_id(header_type, header_text, buttons))")
          .eq("contact_id", effectiveContactId).not("sent_at", "is", null).order("sent_at", { ascending: true }).limit(200)
      : null;

    const tagsQuery = effectiveContactId
      ? context.supabase.from("contact_tags")
          .select("tags:tag_id(id,nome,cor)")
          .eq("contact_id", effectiveContactId)
      : null;

    type AutoRow = {
      id: string; rendered_body: string | null; sent_at: string | null; created_at: string;
      status: string; error: string | null; template_id: string | null;
      automations: { event_key?: string | null; template_id?: string | null } | { event_key?: string | null; template_id?: string | null }[] | null;
    };
    // automations não tem coluna de nome amigável — só event_key (chave técnica,
    // ex.: "formulario:...") — usada como rótulo formatado em vez de crua.
    // O anexo (imagem etc.) vem do template em message_templates: preferimos o
    // template_id gravado na própria entrega (o que foi realmente enviado) e
    // caímos para o template_id atual da automação quando a entrega é antiga
    // e não guardou o dela.
    const automationQuery = effectiveContactId
      ? context.supabase.from("automation_deliveries")
          .select("id, rendered_body, sent_at, created_at, status, error, template_id, automations:automation_id(event_key, template_id)")
          .eq("contact_id", effectiveContactId).order("created_at", { ascending: true }).limit(200)
      : null;

    type SharedContact = { nome?: string | null; phone?: string | null };
    type InboundRow = {
      id: string; conteudo: string | null; tipo: string | null; received_at: string; read_at: string | null;
      media_url: string | null; media_path: string | null; media_mime: string | null;
      media_filename: string | null; media_size: number | null;
      wa_message_id: string | null; reply_to_wa_id: string | null;
      reaction_emoji: string | null; reaction_target_wa_id: string | null;
      latitude: number | null; longitude: number | null; location_name: string | null;
      shared_contacts: SharedContact[] | null; is_system_event: boolean | null;
    };

    const [inR, dR, cR, tR, aR] = await Promise.all([
      inboundQuery ?? Promise.resolve({ data: [] as InboundRow[], error: null as { message: string } | null }),
      directQuery ?? Promise.resolve({ data: [] as { id: string; conteudo: string; created_at: string; sent_by: string | null; origem: string; status: string; erro: string | null; delivered_at: string | null; read_at: string | null; failed_at: string | null; media_path: string | null; media_mime: string | null; media_filename: string | null; message_id: string | null; endpoint_used: string | null; link_url: string | null; link_title: string | null; link_description: string | null; link_image: string | null; reaction_emoji: string | null; reaction_target_wa_id: string | null }[], error: null as { message: string } | null }),
      campaignQuery ?? Promise.resolve({ data: [] as { id: string; rendered_message: string | null; sent_at: string | null; status: string; endpoint_used: string | null; message_id: string | null; link_url: string | null; link_title: string | null; link_description: string | null; link_image: string | null; campaigns: { nome?: string; whatsapp_template_id?: string | null; whatsapp_templates?: { header_type?: string | null; header_text?: string | null; buttons?: unknown } | { header_type?: string | null; header_text?: string | null; buttons?: unknown }[] | null } | { nome?: string; whatsapp_template_id?: string | null; whatsapp_templates?: { header_type?: string | null; header_text?: string | null; buttons?: unknown } | { header_type?: string | null; header_text?: string | null; buttons?: unknown }[] | null }[] | null }[], error: null as { message: string } | null }),
      tagsQuery ?? Promise.resolve({ data: [] as { tags: { id: string; nome: string; cor: string | null } | { id: string; nome: string; cor: string | null }[] | null }[] }),
      automationQuery ?? Promise.resolve({ data: [] as AutoRow[], error: null as { message: string } | null }),
    ]);
    const inboundRaw = ((inR.data ?? []) as InboundRow[]);
    const direct = dR.data ?? [];
    const campaign = cR.data ?? [];
    const tagRows = tR.data ?? [];

    // Nenhuma das 4 consultas acima lança exceção em erro (supabase-js devolve
    // { data: null, error }) — sem checar isso, uma falha (coluna renomeada,
    // join quebrado etc.) vira silenciosamente "sem histórico" e dispara o
    // fallback errado, mascarando dado que existe de verdade.
    const sourceErrors: { source: string; message: string }[] = [];
    if (inR.error) sourceErrors.push({ source: "inbound_messages", message: inR.error.message });
    if (dR.error) sourceErrors.push({ source: "direct_messages", message: dR.error.message });
    if (cR.error) sourceErrors.push({ source: "campaign_recipients", message: cR.error.message });
    if (aR.error) sourceErrors.push({ source: "automation_deliveries", message: aR.error.message });
    if (sourceErrors.length > 0) {
      console.error(
        `[getConversation] falha ao buscar fonte(s) de histórico (contact_id=${effectiveContactId ?? "?"}):`,
        sourceErrors,
      );
    }

    // Mídia recebida guardada no bucket privado: gera URL assinada para exibir.
    const mediaPaths = inboundRaw.map((m) => m.media_path).filter((p): p is string => Boolean(p));
    const signedByPath: Record<string, string> = {};
    if (mediaPaths.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: signed } = await supabaseAdmin
        .storage.from("inbox-media").createSignedUrls(mediaPaths, 60 * 60);
      (signed ?? []).forEach((s) => {
        if (s.path && s.signedUrl) signedByPath[s.path] = s.signedUrl;
      });
    }

    // Reações não viram bolha: vão presas na mensagem reagida (como no WhatsApp).
    // Inbound = reação que o CONTATO enviou; direct = reação que NÓS enviamos
    // pelo Inbox (registrada em direct_messages com reaction_target_wa_id).
    // `mine` diferencia as duas para a interface exibir "Você reagiu".
    const reactions = [
      ...inboundRaw
        .filter((m) => m.tipo === "reaction" && m.reaction_emoji)
        .map((m) => ({
          id: m.id,
          emoji: m.reaction_emoji as string,
          target_wa_id: m.reaction_target_wa_id,
          at: m.received_at,
          mine: false,
        })),
      ...direct
        .filter((d) => d.reaction_target_wa_id)
        .map((d) => ({
          id: d.id,
          // Emoji vazio = reação removida (registro fica pra auditoria).
          emoji: d.reaction_emoji ?? "",
          target_wa_id: d.reaction_target_wa_id,
          at: d.created_at,
          mine: true,
        })),
    ].filter((r) => r.emoji);

    const inbound = inboundRaw
      .filter((m) => m.tipo !== "reaction" && !m.is_system_event)
      .map((m) => ({
        ...m,
        media_url: m.media_path ? (signedByPath[m.media_path] ?? null) : m.media_url,
      }));

    const systemEvents = inboundRaw
      .filter((m) => m.is_system_event)
      .map((m) => ({ id: m.id, at: m.received_at, text: m.conteudo }));

    const automationRows = (aR.data ?? []) as AutoRow[];
    const automationTemplateIds = Array.from(
      new Set(
        automationRows
          .map((a) => {
            const auto = Array.isArray(a.automations) ? a.automations[0] : a.automations;
            return a.template_id ?? auto?.template_id ?? null;
          })
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const templateMediaById: Record<string, { media_path: string | null; media_mime: string | null; media_filename: string | null }> = {};
    if (automationTemplateIds.length > 0) {
      const { data: tpls } = await context.supabase
        .from("message_templates")
        .select("id, media_path, media_mime, media_filename")
        .in("id", automationTemplateIds);
      (tpls ?? []).forEach((t) => {
        templateMediaById[t.id as string] = {
          media_path: (t.media_path as string | null) ?? null,
          media_mime: (t.media_mime as string | null) ?? null,
          media_filename: (t.media_filename as string | null) ?? null,
        };
      });
    }

    const automation = automationRows
      .filter((a) => a.status !== "skipped")
      .map((a) => {
        const auto = Array.isArray(a.automations) ? a.automations[0] : a.automations;
        const tplId = a.template_id ?? auto?.template_id ?? null;
        const media = tplId ? templateMediaById[tplId] : undefined;
        return {
          id: a.id,
          rendered_body: a.rendered_body,
          sent_at: a.sent_at ?? a.created_at,
          status: a.status,
          error: a.error,
          automation_name: formatEventKeyLabel(auto?.event_key),
          media_path: media?.media_path ?? null,
          media_mime: media?.media_mime ?? null,
          media_filename: media?.media_filename ?? null,
        };
      });

    const senderIds = Array.from(new Set(direct.map((d) => d.sent_by).filter((x): x is string => Boolean(x))));
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

    const tags = tagRows.map((r) => {
      const raw = r.tags as { id: string; nome: string; cor: string | null } | { id: string; nome: string; cor: string | null }[] | null;
      return Array.isArray(raw) ? raw[0] : raw;
    }).filter((t): t is { id: string; nome: string; cor: string | null } => Boolean(t));

    // Conversas de mecanismo antigo que nunca gravou detalhe em nenhuma das 4
    // fontes (só sobrou o resumo em conversations.last_message_preview). Fallback
    // só entra quando as 4 tabelas estão de fato vazias — checagem pré-filtro
    // (reações/eventos de sistema ainda contam como "tem registro" no inbound).
    // Se alguma das 4 falhou (sourceErrors), NUNCA trata como "vazio" — não dá
    // pra saber se realmente não há histórico ou se só a consulta quebrou.
    const noDetailedHistory =
      sourceErrors.length === 0 &&
      inboundRaw.length === 0 && direct.length === 0 && campaign.length === 0 && (aR.data ?? []).length === 0;
    const preview = (convRow?.last_message_preview ?? "").trim();
    const fallback_last_message = noDetailedHistory && preview
      ? {
          text: preview,
          at: convRow?.last_message_at ?? null,
          direction: convRow?.last_message_direction ?? "out",
        }
      : null;

    return {
      conversation: convRow,
      contact,
      tags,
      inbound,
      reactions,
      systemEvents,
      automation,
      fallback_last_message,
      source_errors: sourceErrors,
      direct: direct
        // Registros de reação enviada por nós não são bolha de mensagem —
        // já entraram no array `reactions` acima (presos à bolha alvo).
        .filter((d) => !d.reaction_target_wa_id)
        .map((d) => ({ ...d, sender_name: d.sent_by ? senderNames[d.sent_by as string] ?? null : null })),
      campaign: campaign.map((r) => {
        const campaignRow = (Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns) as {
          nome?: string;
          whatsapp_template_id?: string | null;
          whatsapp_templates?: { header_type?: string | null; header_text?: string | null; buttons?: unknown } | { header_type?: string | null; header_text?: string | null; buttons?: unknown }[] | null;
        } | null;
        const templateRow = campaignRow?.whatsapp_template_id
          ? (Array.isArray(campaignRow.whatsapp_templates) ? campaignRow.whatsapp_templates[0] : campaignRow.whatsapp_templates)
          : null;
        const buttons = (templateRow?.buttons && Array.isArray(templateRow.buttons))
          ? (templateRow.buttons as TemplateButton[])
          : [];
        const rawHeaderText = templateRow?.header_text ?? null;
        const headerText = rawHeaderText && contact
          ? renderMessageVars(rawHeaderText, {
              nome: contact.nome,
              nome_social: contact.nome, // nome_social não está no select; reaproveita nome
              cidade: contact.cidade,
              bairro: contact.bairro,
              uf: contact.uf,
            }, { origin: "" })
          : rawHeaderText;
        return {
          id: r.id as string,
          rendered_message: r.rendered_message as string | null,
          sent_at: r.sent_at as string | null,
          status: r.status as string,
          endpoint_used: r.endpoint_used as string | null,
          campaign_name: campaignRow?.nome ?? null,
          header_type: templateRow?.header_type ?? null,
          header_text: headerText,
          buttons: r.endpoint_used === "send-template" ? buttons : [],
          link_url: r.link_url,
          link_title: r.link_title,
          link_description: r.link_description,
          link_image: r.link_image,
        };
      }),
      events,
    };
  });

// Vincula uma conversa não-vinculada a um contato existente
export const linkConversationToContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    contact_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, ["admin", "vrm"], "Apenas admin/vrm podem vincular conversas.");



    const { data: conv } = await context.supabase.from("conversations")
      .select("id, from_phone, contact_id").eq("id", data.conversation_id).maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada.");
    if (conv.contact_id) throw new Error("Esta conversa já está vinculada.");

    // Se já existe conversa desse contato, funde: transfere as mensagens e apaga a não-vinculada
    const { data: existing } = await context.supabase.from("conversations")
      .select("id").eq("contact_id", data.contact_id).maybeSingle();

    if (conv.from_phone) {
      await context.supabase.from("inbound_messages")
        .update({ contact_id: data.contact_id })
        .eq("from_phone", conv.from_phone).is("contact_id", null);
      // Mensagens do robô de cadastro gravadas só com o número.
      await context.supabase.from("direct_messages")
        .update({ contact_id: data.contact_id, to_phone: null })
        .eq("to_phone", conv.from_phone.replace(/\D+/g, "")).is("contact_id", null);
    }

    if (existing) {
      await context.supabase.from("conversations").delete().eq("id", conv.id);
    } else {
      await context.supabase.from("conversations")
        .update({ contact_id: data.contact_id, from_phone: null })
        .eq("id", conv.id);
    }
    await context.supabase.from("conversation_events").insert({
      conversation_id: existing?.id ?? conv.id,
      actor_id: context.userId,
      event_type: "linked_contact",
      payload: { contact_id: data.contact_id, from_phone: conv.from_phone } as never,
    });
    return { ok: true, conversation_id: existing?.id ?? conv.id };
  });

// Cria um contato rápido a partir de uma conversa não-vinculada.
// Todos os campos exceto `nome` são opcionais — o operador preenche o que conseguir
// coletar durante o atendimento. Se a origem for LID (identificador anônimo do
// WhatsApp), NÃO gravamos o LID como telefone; o operador pode digitar um número
// real no campo `phone` do formulário.
export const createQuickContactFromConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    nome: z.string().trim().min(1).max(120),
    nome_social: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(30).optional(),
    email: z.string().trim().max(255).optional(),
    cep: z.string().trim().max(15).optional(),
    endereco: z.string().trim().max(240).optional(),
    numero: z.string().trim().max(20).optional(),
    complemento: z.string().trim().max(120).optional(),
    referencia: z.string().trim().max(240).optional(),
    bairro: z.string().trim().max(120).optional(),
    cidade: z.string().trim().max(120).optional(),
    uf: z.string().trim().max(2).optional(),
    profissao: z.string().trim().max(120).optional(),
    observacoes: z.string().trim().max(2000).optional(),
    consentimento_whatsapp: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireInboxAccess(context.supabase, context.userId);



    const { data: conv } = await context.supabase.from("conversations")
      .select("id, from_phone, contact_id").eq("id", data.conversation_id).maybeSingle();
    if (!conv || conv.contact_id) {
      throw new Error("Conversa inválida ou já vinculada.");
    }

    // LID = identificador anônimo do WhatsApp (não é telefone real).
    const originIsLid = Boolean(conv.from_phone && /@lid$/i.test(conv.from_phone));
    // Telefone que vai no cadastro: prioridade para o que o operador digitou;
    // se ele deixou vazio E a origem é um telefone real, usamos o da conversa.
    const phoneForContact = (data.phone && data.phone.trim())
      ? data.phone.trim()
      : (!originIsLid && conv.from_phone ? conv.from_phone : null);

    const { data: novo, error } = await context.supabase.from("contacts").insert({
      nome: data.nome,
      nome_social: data.nome_social ?? null,
      phone_raw: phoneForContact,
      email: data.email ?? null,
      cep: data.cep ?? null,
      endereco: data.endereco ?? null,
      numero: data.numero ?? null,
      complemento: data.complemento ?? null,
      referencia: data.referencia ?? null,
      bairro: data.bairro ?? null,
      cidade: data.cidade ?? null,
      uf: data.uf ? data.uf.toUpperCase() : null,
      profissao: data.profissao ?? null,
      observacoes: data.observacoes ?? null,
      origem: "manual",
      origem_detalhe: originIsLid ? "inbox_quick_create_lid" : "inbox_quick_create",
      consentimento_whatsapp: data.consentimento_whatsapp ?? false,
    }).select("id").single();
    if (error || !novo) throw error ?? new Error("Falha ao criar contato.");

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("apply_contact_source", {
        _contact_id: novo.id,
        _source_user_id: context.userId,
        _source_module: "inbox",
        _source_form_type: null as unknown as "cadastro_completo" | "receber_informacoes",
        _source_link_id: null as unknown as string,
        _event_type: "contato_criado",
        _metadata: { via: "inbox_quick_create" },
      });
    } catch { /* non-blocking */ }

    // Vincula histórico da conversa (todas as mensagens daquele from_phone/LID).
    if (conv.from_phone) {
      await context.supabase.from("inbound_messages")
        .update({ contact_id: novo.id })
        .eq("from_phone", conv.from_phone).is("contact_id", null);
      await context.supabase.from("direct_messages")
        .update({ contact_id: novo.id, to_phone: null })
        .eq("to_phone", conv.from_phone.replace(/\D+/g, "")).is("contact_id", null);
    }
    await context.supabase.from("conversations")
      .update({ contact_id: novo.id, from_phone: null }).eq("id", conv.id);
    await context.supabase.from("conversation_events").insert({
      conversation_id: conv.id,
      actor_id: context.userId,
      event_type: "quick_contact_created",
      payload: {
        contact_id: novo.id,
        origin_is_lid: originIsLid,
        source_from_phone: conv.from_phone,
      } as never,
    });
    return { ok: true, contact_id: novo.id, conversation_id: conv.id, origin_is_lid: originIsLid };
  });

// Mark conversation read (zera unread + marca inbound_messages)
export const markConversationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contact_id: z.string().uuid().optional(),
    conversation_id: z.string().uuid().optional(),
  }).refine((v) => Boolean(v.contact_id || v.conversation_id), {
    message: "Informe a conversa ou o contato.",
  }).parse(d))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();

    // Conversas antigas (anteriores à API oficial) frequentemente não têm contato
    // vinculado — nesse caso marcamos pelo id da conversa e pelo telefone de origem.
    let contactId = data.contact_id ?? null;
    let fromPhone: string | null = null;
    if (data.conversation_id) {
      const { data: conv } = await context.supabase
        .from("conversations")
        .select("id, contact_id, from_phone")
        .eq("id", data.conversation_id)
        .maybeSingle();
      contactId = contactId ?? (conv?.contact_id as string | null) ?? null;
      fromPhone = (conv?.from_phone as string | null) ?? null;
    }

    if (contactId) {
      // Marca lidas tanto as mensagens vinculadas ao contato quanto as que
      // chegaram pelo mesmo telefone (casos de 9º dígito/DDI divergente).
      const { data: contact } = await context.supabase
        .from("contacts")
        .select("phone_e164")
        .eq("id", contactId)
        .maybeSingle();
      const phone = (contact?.phone_e164 as string | null) ?? null;
      if (phone) {
        await context.supabase.from("inbound_messages")
          .update({ read_at: now })
          .eq("from_phone", phone).is("read_at", null);
      }
      await context.supabase.from("inbound_messages")
        .update({ read_at: now })
        .eq("contact_id", contactId).is("read_at", null);
      await context.supabase.from("conversations").update({ unread_count: 0 }).eq("contact_id", contactId);
    }
    if (data.conversation_id) {
      if (fromPhone) {
        await context.supabase.from("inbound_messages")
          .update({ read_at: now })
          .eq("from_phone", fromPhone).is("read_at", null);
      }
      await context.supabase.from("conversations").update({ unread_count: 0 }).eq("id", data.conversation_id);
    }
    return { ok: true };
  });

// Marca a conversa como NÃO lida (guardar para depois): desmarca a leitura da
// última mensagem recebida e recoloca o contador em 1.
export const markConversationUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conv } = await context.supabase
      .from("conversations")
      .select("id, contact_id, from_phone")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (!conv) throw new Error("Conversa não encontrada.");

    const contactId = (conv.contact_id as string | null) ?? null;
    const fromPhone = (conv.from_phone as string | null) ?? null;

    let lastQ = context.supabase
      .from("inbound_messages")
      .select("id")
      .order("received_at", { ascending: false })
      .limit(1);
    lastQ = contactId
      ? lastQ.eq("contact_id", contactId)
      : lastQ.eq("from_phone", fromPhone ?? "");

    const { data: last } = await lastQ;
    const lastId = (last ?? [])[0]?.id as string | undefined;
    if (lastId) {
      await context.supabase.from("inbound_messages")
        .update({ read_at: null })
        .eq("id", lastId);
    }
    await context.supabase.from("conversations")
      .update({ unread_count: 1 })
      .eq("id", data.conversation_id);
    return { ok: true };
  });



export const assignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid(),
    assigned_to: z.string().uuid().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    // Guarda o responsável anterior para poder avisar quem perdeu a conversa.
    const { data: prev } = await context.supabase
      .from("conversations")
      .select("assigned_to, last_message_preview, contacts:contact_id(nome)")
      .eq("id", data.conversation_id)
      .maybeSingle();

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

    // Aviso no WhatsApp pessoal da equipe (template oficial). Nunca derruba a atribuição.
    const contactRow = (Array.isArray(prev?.contacts) ? prev?.contacts[0] : prev?.contacts) as { nome?: string | null } | null;
    const { notifyConversationAssignment } = await import("@/lib/inbox-assignment-notify.server");
    const notifications = await notifyConversationAssignment(context.supabase, {
      actorId: context.userId,
      newAssignee: data.assigned_to,
      previousAssignee: (prev?.assigned_to as string | null) ?? null,
      contactName: contactRow?.nome ?? null,
      lastMessagePreview: (prev?.last_message_preview as string | null) ?? null,
    });

    const failed = notifications.filter((n) => !n.ok);
    if (failed.length > 0) {
      await context.supabase.from("conversation_events").insert({
        conversation_id: data.conversation_id,
        actor_id: context.userId,
        event_type: "note",
        payload: { notify_error: failed.map((f) => `${f.template}:${f.error ?? "erro"}`).join("; ") } as ConvEventPayload,
      });
    }

    return {
      ok: true,
      notified: notifications.filter((n) => n.ok).length,
      not_notified: failed.map((f) => f.error ?? "erro"),
    };
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

// ------- Painel lateral do contato: tags e formas de ajuda editáveis -------

export const addContactTagFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contact_id: z.string().uuid(),
        tag_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireInboxAccess(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("contact_tags")
      .insert({ contact_id: data.contact_id, tag_id: data.tag_id });
    if (error && error.code !== "23505") throw error; // 23505 = já existe, idempotente
    return { ok: true };
  });

export const removeContactTagFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contact_id: z.string().uuid(),
        tag_id: z.string().uuid(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireInboxAccess(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("contact_tags")
      .delete()
      .eq("contact_id", data.contact_id)
      .eq("tag_id", data.tag_id);
    if (error) throw error;
    return { ok: true };
  });

// Lista de tags ordenada por mais aplicada recentemente em QUALQUER contato do
// sistema — funciona como "favoritas" automáticas sem mecanismo de favoritar
// manual: quem a equipe mais usou agora tende a aparecer primeiro no picker.
export const listTagsForInboxPicker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireInboxAccess(context.supabase, context.userId);
    const { data: tags, error } = await context.supabase
      .from("tags")
      .select("id,nome,cor,categoria");
    if (error) throw error;
    const { data: recent } = await context.supabase
      .from("contact_tags")
      .select("tag_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    const order = new Map<string, string>();
    for (const r of recent ?? []) {
      const tagId = r.tag_id as string;
      if (!order.has(tagId)) order.set(tagId, r.created_at as string);
    }
    return (tags ?? []).sort((a, b) => {
      const ao = order.get(a.id as string) ?? "";
      const bo = order.get(b.id as string) ?? "";
      return bo.localeCompare(ao);
    });
  });

// Cria uma tag nova direto do picker do Inbox. Categoria fixa "interesse" —
// o operador do Inbox não escolhe categoria (não é exposta na UI); é só uma
// etiqueta rápida durante o atendimento. Quem quiser reclassificar usa a
// Gestão de Tags, que já expõe todas as categorias.
export const createContactTagFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ nome: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireInboxAccess(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("tags")
      .insert({ nome: data.nome, categoria: "interesse" })
      .select("id,nome,cor,categoria")
      .single();
    if (error) throw error;
    return row;
  });

export const updateContactFormasAjudaFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        contact_id: z.string().uuid(),
        formas_ajuda: z.array(z.string()),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireInboxAccess(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("contacts")
      .update({ formas_ajuda: data.formas_ajuda })
      .eq("id", data.contact_id);
    if (error) throw error;
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
    // Quem tem WhatsApp vinculado recebe o aviso automático de atribuição.
    const { resolveStaffWhatsapp } = await import("@/lib/inbox-assignment-notify.server");
    const waMap = await resolveStaffWhatsapp(context.supabase, ids);

    return ids
      .map((id) => {
        const p = byId.get(id);
        if (!p || p.status === "revoked" || p.status === "suspended") return null;
        return {
          id,
          name: p.name,
          role: roleById.get(id) ?? "comunicacao",
          has_whatsapp: Boolean(waMap.get(id)?.phone),
        };
      })
      .filter((x): x is { id: string; name: string; role: string; has_whatsapp: boolean } => x !== null)
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

// Lista read-only para o módulo. Retorna qualquer contato ativo com telefone
// (E.164 ou candidato), independente de status do WhatsApp — opt-out e arquivado ficam de fora.
// A UI pode filtrar por "só confirmados" quando quiser.
export const listCommContactsForBulk = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    search: z.string().trim().max(120).optional(),
    onlyConfirmed: z.boolean().optional(),
    limit: z.number().int().min(1).max(1000).default(500),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("contacts")
      .select("id, nome, phone_e164, phone_whatsapp_candidate, cidade, uf, bairro, whatsapp_status, consentimento_whatsapp")
      .is("opt_out_at", null)
      .is("arquivado_at", null)
      .or("phone_e164.not.is.null,phone_whatsapp_candidate.not.is.null")
      .order("nome", { ascending: true })
      .limit(data.limit);
    if (data.onlyConfirmed) q = q.eq("whatsapp_status", "confirmado");
    if (data.search) {
      const s = data.search;
      const digits = s.replace(/\D+/g, "");
      q = digits.length >= 4
        ? q.or(`nome.ilike.%${s}%,phone_e164.ilike.%${digits}%,phone_digits.ilike.%${digits}%,cidade.ilike.%${s}%,bairro.ilike.%${s}%`)
        : q.or(`nome.ilike.%${s}%,cidade.ilike.%${s}%,bairro.ilike.%${s}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ------- Reagir a uma mensagem com emoji (Cloud API oficial) -------

export const reactToInboxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conversation_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    // wa_id (wamid.…) da mensagem ALVO da reação — pode ser de uma mensagem
    // recebida do contato ou de uma que nós enviamos.
    message_wa_id: z.string().trim().min(5).max(200),
    // Emoji (ex.: "❤️"). String vazia = remover a reação anterior.
    emoji: z.string().trim().max(16).default(""),
  }).refine((d) => Boolean(d.conversation_id || d.contact_id), {
    message: "Informe a conversa ou o contato.",
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireInboxAccess(context.supabase, context.userId);

    const convQuery = data.conversation_id
      ? context.supabase.from("conversations").select("id, from_phone, last_inbound_at, contact_id").eq("id", data.conversation_id).maybeSingle()
      : context.supabase.from("conversations").select("id, from_phone, last_inbound_at, contact_id").eq("contact_id", data.contact_id!).maybeSingle();
    const { data: conv, error: convErr } = await convQuery;
    if (convErr || !conv?.from_phone) throw new Error("Conversa não encontrada.");

    // Reação é mensagem de texto livre: a Meta só aceita dentro da janela de 24h.
    const win = windowState(conv.last_inbound_at as string | null);
    if (!win.open) {
      throw new Error("A janela de 24h desta conversa fechou — não é possível reagir agora.");
    }

    const phone = String(conv.from_phone).replace(/\D+/g, "");
    const { whatsappCloud } = await import("@/integrations/whatsapp-cloud/client.server");

    let sentMessageId: string | null = null;
    let sendError: string | null = null;
    try {
      const res = await whatsappCloud.sendReaction(phone, data.message_wa_id, data.emoji);
      sentMessageId = res.messageId ?? null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Janela vencida entre a checagem e o envio, ou mensagem alvo antiga demais.
      sendError = /131047|re-engagement|24/i.test(msg)
        ? "A janela de 24h fechou — não foi possível enviar a reação."
        : /131|132/.test(msg)
          ? "O WhatsApp recusou a reação (mensagem muito antiga ou inválida)."
          : "Falha ao enviar a reação para o WhatsApp.";
    }

    // Registro local SEMPRE (mesmo em erro): é o que prende a reação na bolha
    // e fica de auditoria. Emoji vazio + sucesso = reação removida.
    await context.supabase.from("direct_messages").insert({
      contact_id: (conv.contact_id as string | null) ?? data.contact_id ?? null,
      to_phone: (conv.contact_id ?? data.contact_id) ? null : phone,
      sent_by: context.userId,
      origem: "inbox",
      conteudo: data.emoji ? `Reagiu com ${data.emoji}` : "Removeu a reação",
      status: sendError ? "erro" : "enviado",
      erro: sendError,
      message_id: sentMessageId,
      reaction_emoji: data.emoji || null,
      reaction_target_wa_id: data.message_wa_id,
      endpoint_used: "cloud-api-reaction",
    } as never);

    if (sendError) throw new Error(sendError);
    return { ok: true, emoji: data.emoji || null };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ------- List conversations (grouped by contact) -------
export const listInboxConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    filter: z.enum(["all", "unread", "resolved"]).default("all"),
    search: z.string().trim().max(120).optional(),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("inbound_messages")
      .select("id, contact_id, from_phone, from_name, conteudo, tipo, received_at, read_at, resolved_at, contacts:contact_id(id,nome,cidade,uf,phone_e164,opt_out_at)")
      .order("received_at", { ascending: false })
      .limit(500);

    if (data.filter === "unread") q = q.is("read_at", null);
    if (data.filter === "resolved") q = q.not("resolved_at", "is", null);
    if (data.filter === "all") q = q.is("resolved_at", null);

    const { data: rows, error } = await q;
    if (error) throw error;

    // Group by contact_id (or from_phone when contact_id null)
    const map = new Map<string, {
      key: string;
      contact_id: string | null;
      nome: string | null;
      phone: string | null;
      cidade: string | null;
      uf: string | null;
      last_message: string;
      last_at: string;
      unread_count: number;
      total: number;
      opt_out: boolean;
    }>();

    for (const r of rows ?? []) {
      const contactRow = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
      const key = r.contact_id ?? `phone:${r.from_phone ?? "unknown"}`;
      const existing = map.get(key);
      if (existing) {
        existing.total += 1;
        if (!r.read_at) existing.unread_count += 1;
      } else {
        map.set(key, {
          key,
          contact_id: r.contact_id,
          nome: contactRow?.nome ?? r.from_name ?? null,
          phone: contactRow?.phone_e164 ?? r.from_phone ?? null,
          cidade: contactRow?.cidade ?? null,
          uf: contactRow?.uf ?? null,
          last_message: r.conteudo ?? "",
          last_at: r.received_at,
          unread_count: r.read_at ? 0 : 1,
          total: 1,
          opt_out: Boolean(contactRow?.opt_out_at),
        });
      }
    }

    let list = Array.from(map.values());
    if (data.search) {
      const s = data.search.toLowerCase();
      list = list.filter((c) =>
        (c.nome ?? "").toLowerCase().includes(s) ||
        (c.phone ?? "").toLowerCase().includes(s) ||
        (c.last_message ?? "").toLowerCase().includes(s),
      );
    }
    return list;
  });

// ------- Load a conversation thread -------
export const getInboxConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contact_id: z.string().uuid().optional(),
    phone: z.string().max(30).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let contact: {
      id: string; nome: string | null; phone_e164: string | null; phone_whatsapp_candidate: string | null;
      cidade: string | null; uf: string | null; bairro: string | null; opt_out_at: string | null;
      consentimento_whatsapp: boolean | null; whatsapp_status: string | null;
    } | null = null;

    if (data.contact_id) {
      const { data: c } = await context.supabase
        .from("contacts")
        .select("id,nome,phone_e164,phone_whatsapp_candidate,cidade,uf,bairro,opt_out_at,consentimento_whatsapp,whatsapp_status")
        .eq("id", data.contact_id).maybeSingle();
      contact = c;
    }

    // Inbound
    const inQ = context.supabase
      .from("inbound_messages")
      .select("id, contact_id, from_phone, from_name, conteudo, tipo, received_at, read_at, resolved_at")
      .order("received_at", { ascending: true })
      .limit(500);
    const { data: inbound } = data.contact_id
      ? await inQ.eq("contact_id", data.contact_id)
      : await inQ.eq("from_phone", data.phone ?? "");

    // Outbound (direct messages + campaign_recipients + automation_deliveries)
    let direct: { id: string; conteudo: string; created_at: string; sent_by: string | null; origem: string; status: string }[] = [];
    let campaign: { id: string; rendered_message: string | null; sent_at: string | null; status: string; campaign_name: string | null }[] = [];
    if (data.contact_id) {
      const { data: d } = await context.supabase
        .from("direct_messages")
        .select("id,conteudo,created_at,sent_by,origem,status")
        .eq("contact_id", data.contact_id).order("created_at", { ascending: true });
      direct = d ?? [];

      const { data: cr } = await context.supabase
        .from("campaign_recipients")
        .select("id, rendered_message, sent_at, status, campaigns:campaign_id(nome)")
        .eq("contact_id", data.contact_id)
        .not("sent_at", "is", null)
        .order("sent_at", { ascending: true });
      campaign = (cr ?? []).map((r) => ({
        id: r.id,
        rendered_message: r.rendered_message,
        sent_at: r.sent_at,
        status: r.status,
        campaign_name: (Array.isArray(r.campaigns) ? r.campaigns[0]?.nome : (r.campaigns as { nome?: string } | null)?.nome) ?? null,
      }));
    }

    return { contact, inbound: inbound ?? [], direct, campaign };
  });

// ------- Mark read / resolved -------
export const markInboxRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contact_id: z.string().uuid().optional(),
    phone: z.string().max(30).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("inbound_messages").update({ read_at: new Date().toISOString() }).is("read_at", null);
    q = data.contact_id ? q.eq("contact_id", data.contact_id) : q.eq("from_phone", data.phone ?? "");
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

export const resolveInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contact_id: z.string().uuid().optional(),
    phone: z.string().max(30).optional(),
    resolved: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const patch = data.resolved
      ? { resolved_at: new Date().toISOString(), resolved_by: context.userId }
      : { resolved_at: null, resolved_by: null };
    let q = context.supabase.from("inbound_messages").update(patch);
    q = data.contact_id ? q.eq("contact_id", data.contact_id) : q.eq("from_phone", data.phone ?? "");
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

// ------- Send reply via Z-API -------
function renderVars(body: string, c: { nome?: string | null; cidade?: string | null; bairro?: string | null }) {
  const primeiro = (c.nome ?? "").trim().split(/\s+/)[0] ?? "";
  return body
    .replace(/\{\{\s*nome\s*\}\}/g, c.nome ?? "")
    .replace(/\{\{\s*primeiro_nome\s*\}\}/g, primeiro)
    .replace(/\{\{\s*cidade\s*\}\}/g, c.cidade ?? "")
    .replace(/\{\{\s*bairro\s*\}\}/g, c.bairro ?? "");
}

export const sendDirectMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    contact_id: z.string().uuid(),
    message: z.string().trim().max(4000).default(""),
    template_id: z.string().uuid().optional(),
    origem: z.enum(["inbox", "mapa", "ficha"]).default("inbox"),
    inbound_id: z.string().uuid().optional(),
    media_path: z.string().trim().max(500).optional().nullable(),
    media_mime: z.string().trim().max(120).optional().nullable(),
    media_filename: z.string().trim().max(200).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId)
      .in("role", ["admin", "operador"]).maybeSingle();
    if (!role) throw new Error("Apenas admin/operador podem enviar mensagens.");

    const { data: c, error } = await context.supabase
      .from("contacts")
      .select("id,nome,cidade,bairro,phone_e164,phone_whatsapp_candidate,opt_out_at,consentimento_whatsapp,whatsapp_status")
      .eq("id", data.contact_id).single();
    if (error || !c) throw new Error("Contato não encontrado.");

    if (c.opt_out_at) throw new Error("Contato optou por sair. Envio bloqueado.");
    const phone = c.phone_whatsapp_candidate ?? c.phone_e164;
    if (!phone) throw new Error("Contato sem WhatsApp válido.");
    if (c.whatsapp_status === "invalido" || c.whatsapp_status === "erro_envio" || c.whatsapp_status === "opt_out") {
      throw new Error("WhatsApp do contato indisponível para envio.");
    }

    const rendered = renderVars(data.message ?? "", c);
    const hasMedia = Boolean(data.media_path);
    if (!hasMedia && !rendered.trim()) throw new Error("Escreva uma mensagem ou anexe um arquivo.");
    const phoneDigits = phone.replace(/\D+/g, "");

    let zaap: { zaapId?: string; messageId?: string; id?: string } | null = null;
    let sendError: string | null = null;
    try {
      const { zapi } = await import("@/integrations/zapi/client.server");
      if (hasMedia && data.media_path) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: signed, error: sErr } = await supabaseAdmin
          .storage.from("campaign-media").createSignedUrl(data.media_path, 60 * 60);
        if (sErr || !signed?.signedUrl) throw new Error("Falha ao gerar URL do anexo.");
        const mime = (data.media_mime ?? "").toLowerCase();
        if (mime.startsWith("image/")) {
          zaap = await zapi.sendImage(phoneDigits, signed.signedUrl, rendered || undefined);
        } else if (mime.startsWith("audio/")) {
          zaap = await zapi.sendAudio(phoneDigits, signed.signedUrl);
          if (rendered.trim()) await zapi.sendText(phoneDigits, rendered);
        } else {
          // Documento (PDF, etc.): deriva extensão do filename
          const ext = (data.media_filename ?? "").split(".").pop()?.toLowerCase() ?? "pdf";
          zaap = await zapi.sendDocument(phoneDigits, signed.signedUrl, data.media_filename ?? "arquivo", ext);
          if (rendered.trim()) await zapi.sendText(phoneDigits, rendered);
        }
      } else {
        zaap = await zapi.sendText(phoneDigits, rendered);
      }
    } catch (e) {
      sendError = e instanceof Error ? e.message : String(e);
    }

    // Conteúdo salvo: se veio anexo sem texto, marca [anexo]
    const conteudoSalvo = rendered.trim() || (hasMedia ? `[anexo: ${data.media_filename ?? "arquivo"}]` : "");

    const { data: row, error: insErr } = await context.supabase
      .from("direct_messages")
      .insert({
        contact_id: data.contact_id,
        sent_by: context.userId,
        origem: data.origem,
        template_id: data.template_id ?? null,
        inbound_id: data.inbound_id ?? null,
        conteudo: conteudoSalvo,
        status: sendError ? "erro" : "enviado",
        erro: sendError,
        zaap_id: zaap?.zaapId ?? null,
        message_id: zaap?.messageId ?? zaap?.id ?? null,
        media_path: data.media_path ?? null,
        media_mime: data.media_mime ?? null,
        media_filename: data.media_filename ?? null,
      })
      .select().single();
    if (insErr) throw insErr;

    // Audit
    await context.supabase.from("contact_audit_log").insert({
      contact_id: data.contact_id,
      user_id: context.userId,
      action: "mensagem_avulsa",
      changes: { origem: data.origem, status: sendError ? "erro" : "enviado", erro: sendError, media: hasMedia } as never,
    });

    // If replying to an inbound: mark that inbound conversation as read
    if (data.origem === "inbox") {
      await context.supabase.from("inbound_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("contact_id", data.contact_id).is("read_at", null);
    }

    if (sendError) throw new Error(sendError);
    return { ok: true, id: row.id };
  });

// ------- Quick reply templates for inbox / mapa -------
export const listQuickReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("message_templates")
      .select("id,title,body,category,variables")
      .eq("active", true)
      .is("archived_at", null)
      .in("kind", ["quick_reply", "system"])
      .order("title");
    if (error) throw error;
    return data ?? [];
  });

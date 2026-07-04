import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "@/lib/authz";


const listSchema = z.object({
  search: z.string().optional(),
  cidade: z.string().optional(),
  uf: z.string().optional(),
  origem: z.enum(["recadastro", "inscricao", "import", "manual"]).optional(),
  consentOnly: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

export const listContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("contacts")
      .select(
        "id,nome,phone_e164,phone_status,whatsapp_status,cidade,uf,origem,consentimento_whatsapp,opt_out_at,arquivado_at,lifecycle_status,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);
    if (!data.includeArchived) q = q.is("arquivado_at", null);
    if (data.search) {
      const s = data.search.trim().replace(/[%_,]/g, " ");
      q = q.or(`nome.ilike.%${s}%,phone_e164.ilike.%${s}%,email.ilike.%${s}%`);
    }
    if (data.cidade) q = q.eq("cidade", data.cidade);
    if (data.uf) q = q.eq("uf", data.uf);
    if (data.origem) q = q.eq("origem", data.origem);
    if (data.consentOnly) q = q.eq("consentimento_whatsapp", true).is("opt_out_at", null);
    const { data: rows, count, error } = await q;
    if (error) throw error;
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

export const getContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: contact, error } = await context.supabase
      .from("contacts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw error;
    const { data: ct } = await context.supabase
      .from("contact_tags")
      .select("tag_id, tags(id,nome,cor,categoria)")
      .eq("contact_id", data.id);
    const tags = (ct ?? []).map((r) => r.tags).filter(Boolean);
    return { contact, tags };
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().trim().min(2).max(120).optional(),
  nome_social: z.string().trim().max(120).nullable().optional(),
  email: z.string().trim().email().max(255).nullable().optional().or(z.literal("")),
  email_secundario: z.string().trim().email().max(255).nullable().optional().or(z.literal("")),
  phone_raw: z.string().trim().max(40).nullable().optional(),
  phone_secundario_raw: z.string().trim().max(40).nullable().optional(),
  cep: z.string().trim().max(12).nullable().optional(),
  endereco: z.string().trim().max(240).nullable().optional(),
  numero: z.string().trim().max(20).nullable().optional(),
  complemento: z.string().trim().max(120).nullable().optional(),
  referencia: z.string().trim().max(240).nullable().optional(),
  bairro: z.string().trim().max(120).nullable().optional(),
  cidade: z.string().trim().max(120).nullable().optional(),
  uf: z.string().trim().length(2).nullable().optional(),
  profissao: z.string().trim().max(120).nullable().optional(),
  instituicao: z.string().trim().max(240).nullable().optional(),
  coletivo_alicerce: z.boolean().nullable().optional(),
  participa_movimento_social: z.boolean().nullable().optional(),
  movimento_social_nome: z.string().trim().max(160).nullable().optional(),
  tipo_contato: z
    .enum(["apoiador", "voluntario", "lista_divulgacao", "importado", "outro"])
    .nullable()
    .optional(),
  formas_ajuda: z.array(z.string().max(60)).max(20).optional(),
  formas_ajuda_outro: z.string().trim().max(240).nullable().optional(),
  consentimento_whatsapp: z.boolean().optional(),
  origem_detalhe: z.string().trim().max(120).nullable().optional(),
  observacoes: z.string().trim().max(4000).nullable().optional(),
  geocode: z.boolean().optional(),
});

export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { id, geocode, ...rest } = data;
    const { data: prev, error: prevErr } = await context.supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .single();
    if (prevErr) throw prevErr;

    // Empty email -> null
    const payload: Record<string, unknown> = { ...rest };
    if (payload.email === "") payload.email = null;
    if (payload.email_secundario === "") payload.email_secundario = null;
    if (payload.uf && typeof payload.uf === "string") payload.uf = payload.uf.toUpperCase();

    // Phone change: trigger contacts_phone_fill recomputes everything via phone_raw
    const phoneChanged =
      payload.phone_raw !== undefined && (payload.phone_raw ?? null) !== (prev.phone_raw ?? null);
    if (phoneChanged) {
      payload.phone_status = null; // trigger will recompute
    }

    const { data: updated, error } = await context.supabase
      .from("contacts")
      .update(payload as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    // Audit
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of Object.keys(payload)) {
      if (JSON.stringify((prev as Record<string, unknown>)[k]) !== JSON.stringify((updated as Record<string, unknown>)[k])) {
        changes[k] = { from: (prev as Record<string, unknown>)[k], to: (updated as Record<string, unknown>)[k] };
      }
    }
    if (Object.keys(changes).length) {
      await context.supabase.from("contact_audit_log").insert({
        contact_id: id,
        user_id: context.userId,
        action: "update",
        changes: changes as never,
      });
    }

    // Phone duplicate detection
    if (phoneChanged && updated.phone_last8) {
      const { data: dups } = await context.supabase
        .from("contacts")
        .select("id")
        .neq("id", id)
        .eq("phone_last8", updated.phone_last8)
        .limit(5);
      for (const d of dups ?? []) {
        await context.supabase.from("contact_duplicates").insert({
          contact_a: id,
          contact_b: d.id,
          match_type: "provavel",
          reason: "Edição manual: novo telefone coincide com outro contato",
        });
      }
    }

    // Address change: geocode best-effort
    const addrFields = ["cep", "endereco", "numero", "bairro", "cidade", "uf"];
    const addrChanged = addrFields.some((f) => f in payload);
    if (geocode !== false && addrChanged && (updated.cidade || updated.cep)) {
      try {
        const { geocodeAddress } = await import("@/lib/cep.server");
        const g = await geocodeAddress({
          endereco: updated.endereco,
          numero: updated.numero,
          bairro: updated.bairro,
          cidade: updated.cidade,
          uf: updated.uf,
          cep: updated.cep,
        });
        if (g && g.status !== "erro") {
          await context.supabase
            .from("contacts")
            .update({
              latitude: g.latitude,
              longitude: g.longitude,
              geocoding_provider: g.provider,
              geocoding_status: g.status === "aproximado" ? "aproximado" : "localizado",
              geocoded_at: new Date().toISOString(),
            })
            .eq("id", id);
        } else {
          await context.supabase
            .from("contacts")
            .update({ geocoding_status: g ? "erro" : "pendente" })
            .eq("id", id);
        }
      } catch {
        /* silent */
      }
    }

    return { ok: true as const, id };
  });

export const upsertContact = updateContact;

export const archiveContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("contacts")
      .update({ arquivado_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id);
    await context.supabase.from("contact_audit_log").insert({
      contact_id: data.id,
      user_id: context.userId,
      action: data.archived ? "archive" : "unarchive",
    });
    return { ok: true as const };
  });

// =========== EXCLUSÃO DEFINITIVA (só admin) ===========



async function auditHardDelete(
  ctx: { supabase: { from: (t: string) => unknown }; userId: string },
  contact: Record<string, unknown>,
) {
  try {
    const client = ctx.supabase as unknown as {
      from: (t: string) => { insert: (v: unknown) => Promise<unknown> };
    };
    await client.from("access_audit_log").insert({
      actor_id: ctx.userId,
      target_user_id: null,
      event: "contact_hard_delete",
      meta: {
        contact_id: contact.id,
        nome: contact.nome,
        phone_e164: contact.phone_e164,
        email: contact.email,
        cidade: contact.cidade,
        uf: contact.uf,
        origem: contact.origem,
        deleted_at: new Date().toISOString(),
      },
    });
  } catch {
    /* non-blocking */
  }
}

export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), confirmation: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.confirmation !== "EXCLUIR") {
      throw new Error("Confirmação inválida. Digite EXCLUIR para prosseguir.");
    }
    await requireAdmin(context.supabase, context.userId);
    const { data: contact, error: getErr } = await context.supabase
      .from("contacts")
      .select("*")
      .eq("id", data.id)
      .single();
    if (getErr) throw getErr;
    await auditHardDelete(context, contact as Record<string, unknown>);
    const { error } = await context.supabase.from("contacts").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true as const, id: data.id };
  });

export const deleteContactsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        confirmation: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const expected = String(data.ids.length);
    if (data.confirmation !== expected) {
      throw new Error(`Confirmação inválida. Digite o número exato de contatos (${expected}).`);
    }
    await requireAdmin(context.supabase, context.userId);
    const { data: contacts, error: getErr } = await context.supabase
      .from("contacts")
      .select("id,nome,phone_e164,email,cidade,uf,origem")
      .in("id", data.ids);
    if (getErr) throw getErr;
    for (const c of contacts ?? []) {
      await auditHardDelete(context, c as Record<string, unknown>);
    }
    const { error } = await context.supabase.from("contacts").delete().in("id", data.ids);
    if (error) throw error;
    return { ok: true as const, deleted: (contacts ?? []).length };
  });

export const setOptOut = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ id: z.string().uuid(), optOut: z.boolean(), motivo: z.string().trim().max(240).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const upd: Record<string, unknown> = {
      opt_out_at: data.optOut ? new Date().toISOString() : null,
    };
    if (data.optOut) {
      upd.opt_out_motivo = data.motivo ?? null;
      upd.lifecycle_status = "nao_enviar";
    } else {
      upd.opt_out_motivo = null;
    }
    const { error } = await context.supabase.from("contacts").update(upd as never).eq("id", data.id);
    if (error) throw error;
    await context.supabase.from("contact_audit_log").insert({
      contact_id: data.id,
      user_id: context.userId,
      action: data.optOut ? "opt_out" : "opt_in",
      changes: (data.motivo ? { motivo: data.motivo } : null) as never,
    });
    return { ok: true as const };
  });

export const getContactHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [audit, events, inbound, recipients] = await Promise.all([
      context.supabase
        .from("contact_audit_log")
        .select("id,action,changes,user_id,created_at")
        .eq("contact_id", data.id)
        .order("created_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("message_events")
        .select("id,tipo,payload,received_at,recipient_id")
        .eq("contact_id", data.id)
        .order("received_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("inbound_messages")
        .select("id,conteudo,received_at,tipo")
        .eq("contact_id", data.id)
        .order("received_at", { ascending: false })
        .limit(100),
      context.supabase
        .from("campaign_recipients")
        .select("id,sent_at,erro,campaign_id,delivered_at,failed_at")
        .eq("contact_id", data.id)
        .order("sent_at", { ascending: false })
        .limit(100),
    ]);
    return {
      audit: audit.data ?? [],
      events: events.data ?? [],
      inbound: inbound.data ?? [],
      recipients: recipients.data ?? [],
    };
  });

export const getContactSourceEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: events } = await context.supabase
      .from("contact_source_events")
      .select("id, source_module, source_form_type, event_type, created_at, source_user_id, source_link_id, metadata")
      .eq("contact_id", data.id)
      .order("created_at", { ascending: false })
      .limit(50);
    const userIds = Array.from(new Set((events ?? []).map((e) => e.source_user_id).filter(Boolean))) as string[];
    let names = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      names = new Map((profs ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name ?? "—"]));
    }
    return {
      events: (events ?? []).map((e) => ({
        ...e,
        source_user_name: e.source_user_id ? (names.get(e.source_user_id) ?? "—") : null,
      })),
    };
  });


// Tags
export const listAllTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("tags")
      .select("id,nome,cor,categoria")
      .order("nome");
    return { tags: data ?? [] };
  });

export const createTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        nome: z.string().trim().min(1).max(60),
        cor: z.string().trim().max(20).optional(),
        categoria: z.enum(["perfil", "territorio", "acao", "interno", "origem"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("tags")
      .insert({ nome: data.nome, cor: data.cor ?? undefined, categoria: data.categoria ?? "perfil" })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const setContactTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ contact_id: z.string().uuid(), tag_id: z.string().uuid(), add: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.add) {
      await context.supabase
        .from("contact_tags")
        .upsert({ contact_id: data.contact_id, tag_id: data.tag_id }, { onConflict: "contact_id,tag_id" });
      await context.supabase.from("contact_audit_log").insert({
        contact_id: data.contact_id,
        user_id: context.userId,
        action: "tag_add",
        changes: { tag_id: data.tag_id } as never,
      });
    } else {
      await context.supabase
        .from("contact_tags")
        .delete()
        .eq("contact_id", data.contact_id)
        .eq("tag_id", data.tag_id);
      await context.supabase.from("contact_audit_log").insert({
        contact_id: data.contact_id,
        user_id: context.userId,
        action: "tag_remove",
        changes: { tag_id: data.tag_id } as never,
      });
    }
    return { ok: true as const };
  });

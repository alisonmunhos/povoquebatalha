import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Aplicar DDD em massa ----------
const fixDddSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(1000),
  ddd: z.string().regex(/^\d{2}$/, "DDD precisa ter 2 dígitos"),
});

export const fixContactsPhoneDdd = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => fixDddSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("contacts")
      .select("id,phone_raw,phone_status")
      .in("id", data.contact_ids);
    if (error) throw error;

    let updated = 0;
    let skipped = 0;
    let stillInvalid = 0;
    const digitsOnly = (s: string) => (s ?? "").replace(/\D+/g, "");

    for (const row of rows ?? []) {
      const raw = row.phone_raw ?? "";
      const d = digitsOnly(raw).replace(/^0+/, "");
      // Só reprocessa se estiver realmente "sem DDD" (8 ou 9 dígitos).
      if (d.length !== 8 && d.length !== 9) {
        skipped++;
        continue;
      }
      // Se já tiver DDD embutido (12/13 com 55, ou 10/11), não sobrescreve.
      if (d.length >= 10) {
        skipped++;
        continue;
      }
      const withDdd = `${data.ddd}${d}`; // trigger recalcula phone_e164, phone_status etc.
      const { data: upd, error: upErr } = await context.supabase
        .from("contacts")
        .update({ phone_raw: withDdd, phone_status: null } as never)
        .eq("id", row.id)
        .select("id,phone_status")
        .single();
      if (upErr) {
        skipped++;
        continue;
      }
      updated++;
      if (upd?.phone_status && upd.phone_status !== "valido" && upd.phone_status !== "sem_nono_digito") {
        stillInvalid++;
      }
      await context.supabase.from("contact_audit_log").insert({
        contact_id: row.id,
        user_id: context.userId,
        action: "phone_ddd_apply",
        changes: { ddd: data.ddd, phone_raw_before: raw, phone_raw_after: withDdd } as never,
      });
    }
    return { updated, skipped, stillInvalid };
  });

// ---------- Verificar números no WhatsApp (sob demanda) ----------
const checkSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(500),
});

export const checkWhatsappForContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { zapi, hasZapiEnv } = await import("@/integrations/zapi/client.server");
    if (!hasZapiEnv()) {
      throw new Error("Z-API não está configurada. Configure ZAPI_INSTANCE_ID/TOKEN/CLIENT_TOKEN.");
    }

    const { data: rows, error } = await context.supabase
      .from("contacts")
      .select("id,phone_e164,phone_whatsapp_candidate")
      .in("id", data.contact_ids);
    if (error) throw error;

    let confirmed = 0;
    let invalid = 0;
    let skipped = 0;
    const nowIso = new Date().toISOString();

    for (const row of rows ?? []) {
      const phone = (row.phone_whatsapp_candidate ?? row.phone_e164 ?? "").replace(/\D+/g, "");
      if (!phone || phone.length < 10) {
        skipped++;
        continue;
      }
      let exists = false;
      try {
        const res = await zapi.phoneExists(phone);
        exists = Boolean(res?.exists);
      } catch {
        skipped++;
        continue;
      }
      const newStatus = exists ? "confirmado" : "invalido";
      await context.supabase
        .from("contacts")
        .update({ whatsapp_status: newStatus, whatsapp_checked_at: nowIso } as never)
        .eq("id", row.id);
      await context.supabase.from("contact_audit_log").insert({
        contact_id: row.id,
        user_id: context.userId,
        action: "whatsapp_check",
        changes: { result: newStatus, phone } as never,
      });
      if (exists) confirmed++;
      else invalid++;
    }

    return { confirmed, invalid, skipped };
  });

// ---------- Contagem rápida por chip ----------
export const contactsQuickCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = context.supabase;
    const runCount = async (build: () => PromiseLike<{ count: number | null }>): Promise<number> => {
      const r = await build();
      return r.count ?? 0;
    };
    const [cadastroCompleto, soImportados, precisaRevisao, numeroOk, bloqueados, semWhatsapp] = await Promise.all([
      runCount(() => s.from("contacts").select("id", { count: "exact", head: true }).eq("lifecycle_status", "recadastro_concluido").is("arquivado_at", null)),
      runCount(() => s.from("contacts").select("id", { count: "exact", head: true }).eq("lifecycle_status", "importado_aguardando_recadastro").is("arquivado_at", null)),
      runCount(() => s.from("contacts").select("id", { count: "exact", head: true }).in("phone_status", ["precisa_revisao", "sem_ddd", "sem_nono_digito"]).is("arquivado_at", null)),
      runCount(() => s.from("contacts").select("id", { count: "exact", head: true }).eq("phone_status", "valido").is("arquivado_at", null)),
      runCount(() => s.from("contacts").select("id", { count: "exact", head: true }).eq("lifecycle_status", "nao_enviar")),
      runCount(() => s.from("contacts").select("id", { count: "exact", head: true }).eq("whatsapp_status", "invalido").is("arquivado_at", null)),
    ]);
    return { cadastroCompleto, soImportados, precisaRevisao, numeroOk, bloqueados, semWhatsapp };
  });

// ---------- Facets por status (para dropdowns de coluna e painel) ----------
// Retorna, em UMA chamada, quantos contatos existem hoje em cada valor de
// lifecycle_status, phone_status e whatsapp_status. Respeita arquivado_at IS NULL.
// Serve pra mostrar contadores nos filtros e desabilitar as opções que não têm
// nenhum contato correspondente — evita o "cliquei e não veio nada".
export const contactsStatusFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contacts")
      .select("lifecycle_status,phone_status,whatsapp_status,arquivado_at")
      .is("arquivado_at", null)
      .limit(20000);
    if (error) throw error;
    const lifecycle: Record<string, number> = {};
    const phone: Record<string, number> = {};
    const whatsapp: Record<string, number> = {};
    for (const r of data ?? []) {
      const l = (r.lifecycle_status ?? "") as string;
      const p = (r.phone_status ?? "") as string;
      const w = (r.whatsapp_status ?? "") as string;
      if (l) lifecycle[l] = (lifecycle[l] ?? 0) + 1;
      if (p) phone[p] = (phone[p] ?? 0) + 1;
      if (w) whatsapp[w] = (whatsapp[w] ?? 0) + 1;
    }
    return { lifecycle, phone, whatsapp };
  });


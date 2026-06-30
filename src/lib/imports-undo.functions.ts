import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CONFIRM_PHRASE = "DESFAZER IMPORTAÇÃO";

type ContactRow = {
  id: string;
  nome: string | null;
  phone_e164: string | null;
  email: string | null;
  cidade: string | null;
  uf: string | null;
  lifecycle_status: string | null;
  arquivado_at: string | null;
  created_at: string;
};

type AuthedCtx = { supabase: ReturnType<typeof requireSupabaseAuth.client> extends never ? never : never };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(sb: any, userId: string) {
  const { data } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchContactsForImport(sb: any, importId: string): Promise<ContactRow[]> {
  const all: ContactRow[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("contacts")
      .select("id,nome,phone_e164,email,cidade,uf,lifecycle_status,arquivado_at,created_at")
      .eq("import_id", importId)
      .order("created_at")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as ContactRow[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function classifyHistory(sb: any, ids: string[]): Promise<Set<string>> {
  const withHistory = new Set<string>();
  if (ids.length === 0) return withHistory;
  const chunk = 200;
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const [evs, recs, inbs, merges] = await Promise.all([
      sb.from("message_events").select("contact_id").in("contact_id", part),
      sb.from("campaign_recipients").select("contact_id").in("contact_id", part),
      sb.from("inbound_messages").select("contact_id").in("contact_id", part),
      sb.from("contact_merges").select("survivor_id").in("survivor_id", part),
    ]);
    for (const r of (evs.data ?? []) as { contact_id: string }[]) withHistory.add(r.contact_id);
    for (const r of (recs.data ?? []) as { contact_id: string }[]) withHistory.add(r.contact_id);
    for (const r of (inbs.data ?? []) as { contact_id: string }[]) if (r.contact_id) withHistory.add(r.contact_id);
    for (const r of (merges.data ?? []) as { survivor_id: string }[]) if (r.survivor_id) withHistory.add(r.survivor_id);
  }
  return withHistory;
}

function hasLifecycleHistory(c: ContactRow): boolean {
  return ["recadastro_iniciado", "recadastro_concluido", "duplicado_mesclado"].includes(
    c.lifecycle_status ?? "",
  );
}

// ============================================================================
// PREVIEW — quanto será excluído / arquivado
// ============================================================================
const previewSchema = z.object({ importId: z.string().uuid() });

export const getUndoPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const { data: imp, error } = await sb
      .from("imports")
      .select("id,file_name,status,created_at,total")
      .eq("id", data.importId)
      .single();
    if (error) throw error;

    const contacts = await fetchContactsForImport(sb, data.importId);
    const ids = contacts.map((c) => c.id);
    const historySet = await classifyHistory(sb, ids);

    let comHistorico = 0;
    let semHistorico = 0;
    let jaArquivados = 0;
    for (const c of contacts) {
      if (c.arquivado_at) jaArquivados++;
      else if (historySet.has(c.id) || hasLifecycleHistory(c)) comHistorico++;
      else semHistorico++;
    }

    return {
      import: imp,
      total: contacts.length,
      podeExcluir: semHistorico,
      seraoArquivados: comHistorico,
      jaArquivados,
    };
  });

// ============================================================================
// BACKUP CSV
// ============================================================================
const backupSchema = z.object({ importId: z.string().uuid() });

export const exportBackupCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => backupSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const { data: rows, error } = await sb
      .from("contacts")
      .select(
        "id,nome,phone_raw,phone_e164,phone_status,whatsapp_status,email,cep,endereco,numero,complemento,bairro,cidade,uf,latitude,longitude,origem,origem_detalhe,lifecycle_status,arquivado_at,created_at",
      )
      .eq("import_id", data.importId)
      .order("created_at");
    if (error) throw error;

    const header = [
      "id", "nome", "phone_raw", "phone_e164", "phone_status", "whatsapp_status",
      "email", "cep", "endereco", "numero", "complemento", "bairro", "cidade", "uf",
      "latitude", "longitude", "origem", "origem_detalhe", "lifecycle_status",
      "arquivado_at", "created_at",
    ];
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const lines = [header.join(",")];
    for (const r of (rows ?? []) as Record<string, unknown>[]) {
      lines.push(header.map((h) => esc(r[h])).join(","));
    }
    // Prepend UTF-8 BOM so Excel BR abre com acentos corretos
    const csv = "\uFEFF" + lines.join("\n");
    return { csv, count: rows?.length ?? 0 };
  });

// ============================================================================
// EXECUTAR DESFAZER (admin-only + confirmação forte)
// ============================================================================
const undoSchema = z.object({
  importId: z.string().uuid(),
  mode: z.enum(["archive", "delete_safe"]),
  confirmText: z.string(),
});

export const undoImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => undoSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.confirmText.trim() !== CONFIRM_PHRASE) {
      throw new Error(`Confirmação inválida. Digite exatamente: ${CONFIRM_PHRASE}`);
    }
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;

    const contacts = await fetchContactsForImport(sb, data.importId);
    const ids = contacts.map((c) => c.id);
    const historySet = await classifyHistory(sb, ids);

    const toDelete: string[] = [];
    const toArchive: string[] = [];
    for (const c of contacts) {
      if (c.arquivado_at) continue; // já arquivado, ignora
      const hasHistory = historySet.has(c.id) || hasLifecycleHistory(c);
      if (data.mode === "archive" || hasHistory) toArchive.push(c.id);
      else toDelete.push(c.id);
    }

    // Arquivar em lotes
    const chunk = 200;
    for (let i = 0; i < toArchive.length; i += chunk) {
      const part = toArchive.slice(i, i + chunk);
      await sb
        .from("contacts")
        .update({ arquivado_at: new Date().toISOString(), lifecycle_status: "nao_enviar" } as never)
        .in("id", part);
    }
    // Excluir em lotes (só os sem histórico)
    for (let i = 0; i < toDelete.length; i += chunk) {
      const part = toDelete.slice(i, i + chunk);
      // Limpar referências em contact_duplicates antes
      await sb.from("contact_duplicates").delete().in("contact_a", part);
      await sb.from("contact_duplicates").delete().in("contact_b", part);
      await sb.from("contact_tags").delete().in("contact_id", part);
      await sb.from("contacts").delete().in("id", part);
    }

    await sb.from("imports").update({ status: "reverted" }).eq("id", data.importId);

    await sb.from("import_audit_log").insert({
      import_id: data.importId,
      action: data.mode === "archive" ? "undo_archive" : "undo_delete_safe",
      affected_count: toArchive.length + toDelete.length,
      details: {
        mode: data.mode,
        deleted: toDelete.length,
        archived: toArchive.length,
        total_inspected: contacts.length,
      } as never,
      performed_by: context.userId,
    });

    return {
      deleted: toDelete.length,
      archived: toArchive.length,
      total: contacts.length,
    };
  });

// ============================================================================
// EXCLUIR APENAS O ARQUIVO (não toca em contatos)
// ============================================================================
const deleteFileSchema = z.object({ importId: z.string().uuid() });

export const deleteImportFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteFileSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = context.supabase;
    const { data: imp } = await sb
      .from("imports")
      .select("file_path")
      .eq("id", data.importId)
      .single();
    if (imp?.file_path) {
      await sb.storage.from("imports").remove([imp.file_path]);
    }
    await sb.from("imports").update({ file_path: "" } as never).eq("id", data.importId);
    await sb.from("import_audit_log").insert({
      import_id: data.importId,
      action: "delete_file",
      affected_count: 0,
      details: { file_path: imp?.file_path ?? null } as never,
      performed_by: context.userId,
    });
    return { ok: true };
  });

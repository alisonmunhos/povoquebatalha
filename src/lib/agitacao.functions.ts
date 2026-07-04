// Server fns para o módulo Agitação (Bloco E).
// RLS restringe automaticamente para o agitador só ver contatos que ele captou.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Lista contatos captados pelo usuário logado (via contact_source_events).
// Para admin/vrm, retorna todos os contatos com origem=agitacao.
export const listMyAgitacaoContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      search: z.string().trim().optional(),
      pendentes_atualizacao: z.boolean().optional(),
      sem_contato_realizado: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).default(100),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Ids dos contatos ligados ao usuário logado via contact_source_events (RLS filtra).
    const { data: events } = await context.supabase
      .from("contact_source_events")
      .select("contact_id")
      .eq("source_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(500);
    const ids = Array.from(new Set((events ?? []).map((e) => e.contact_id))).slice(0, 300);
    if (ids.length === 0) return { rows: [], stats: emptyStats() };

    let q = context.supabase
      .from("contacts")
      .select("id, nome, phone_e164, phone_raw, cidade, bairro, uf, lifecycle_status, primary_source_module, source_form_type, source_captured_at, consentimento_whatsapp, created_at")
      .in("id", ids)
      .is("arquivado_at", null)
      .order("source_captured_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (data.search) {
      const s = data.search.replace(/[%_,]/g, " ");
      q = q.or(`nome.ilike.%${s}%,phone_e164.ilike.%${s}%,cidade.ilike.%${s}%,bairro.ilike.%${s}%`);
    }
    const { data: rows } = await q;

    // Logs recentes deste user para deduzir "contato realizado".
    const { data: logs } = await context.supabase
      .from("agitacao_contact_logs")
      .select("contact_id, action, created_at")
      .eq("user_id", context.userId)
      .in("contact_id", ids)
      .order("created_at", { ascending: false });
    const lastAction = new Map<string, string>();
    for (const l of logs ?? []) {
      if (!lastAction.has(l.contact_id)) lastAction.set(l.contact_id, l.action);
    }

    const enriched = (rows ?? []).map((r) => ({
      ...r,
      last_action: lastAction.get(r.id) ?? null,
      contato_realizado: (logs ?? []).some((l) => l.contact_id === r.id && l.action === "contato_realizado"),
    }));

    let filtered = enriched;
    if (data.pendentes_atualizacao) {
      filtered = filtered.filter((r) => r.lifecycle_status !== "recadastro_concluido");
    }
    if (data.sem_contato_realizado) {
      filtered = filtered.filter((r) => !r.contato_realizado);
    }

    const now = Date.now();
    const stats = {
      total: enriched.length,
      cadastros_completos: enriched.filter((r) => r.source_form_type === "cadastro_completo").length,
      inscricoes: enriched.filter((r) => r.source_form_type === "receber_informacoes").length,
      pendentes_atualizacao: enriched.filter((r) => r.lifecycle_status !== "recadastro_concluido").length,
      contatos_realizados: enriched.filter((r) => r.contato_realizado).length,
      novos_7d: enriched.filter((r) => r.source_captured_at && (now - new Date(r.source_captured_at).getTime()) < 7 * 86400_000).length,
    };
    return { rows: filtered, stats };
  });

function emptyStats() {
  return {
    total: 0,
    cadastros_completos: 0,
    inscricoes: 0,
    pendentes_atualizacao: 0,
    contatos_realizados: 0,
    novos_7d: 0,
  };
}

const AGITACAO_ACTIONS = ["whatsapp_aberto", "contato_realizado", "observacao", "pediu_atualizacao", "nao_respondeu"] as const;

export const logAgitacaoAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      contact_id: z.string().uuid(),
      action: z.enum(AGITACAO_ACTIONS),
      observacao: z.string().trim().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("agitacao_contact_logs").insert({
      contact_id: data.contact_id,
      user_id: context.userId,
      action: data.action,
      note: data.observacao ?? null,
      // Observação e "pediu atualização" já nascem pendentes (follow-up) — Frente 3.
      follow_up_status:
        data.action === "observacao" || data.action === "pediu_atualizacao" ? "pendente" : null,
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

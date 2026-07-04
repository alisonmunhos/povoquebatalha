// Server fns para o módulo Agitação (Bloco E).
// RLS restringe automaticamente para o agitador só ver contatos que ele captou.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AGITACAO_ACTIONS = ["whatsapp_aberto", "contato_realizado", "observacao", "pediu_atualizacao", "nao_respondeu"] as const;
const AGITACAO_FIELD_STATUS = ["nao_abordado", "confirmado", "sem_resposta", "observacao", "pediu_atualizacao"] as const;
const AGITACAO_SORTS = ["inclusion", "alphabetical", "recent", "oldest", "nao_abordado_first"] as const;

// Lista contatos captados pelo usuário logado (via contact_source_events).
// Para admin/vrm, retorna todos os contatos com origem=agitacao.
export const listMyAgitacaoContacts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      search: z.string().trim().optional(),
      // Compat: chips antigos.
      pendentes_atualizacao: z.boolean().optional(),
      sem_contato_realizado: z.boolean().optional(),
      // Novo: chips de status + classificação.
      fieldStatus: z.array(z.enum(AGITACAO_FIELD_STATUS)).optional(),
      sortBy: z.enum(AGITACAO_SORTS).default("inclusion"),
      limit: z.number().int().min(1).max(500).default(200),
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
    if (ids.length === 0) return { rows: [], stats: emptyStats(), counts: emptyCounts() };

    let q = context.supabase
      .from("contacts")
      .select("id, nome, phone_e164, phone_raw, cidade, bairro, uf, lifecycle_status, primary_source_module, source_form_type, source_captured_at, consentimento_whatsapp, created_at")
      .in("id", ids)
      .is("arquivado_at", null)
      .limit(data.limit);

    // Ordenação inicial no banco (refino no client para "nao_abordado_first").
    if (data.sortBy === "alphabetical") {
      q = q.order("nome", { ascending: true, nullsFirst: false });
    } else if (data.sortBy === "oldest") {
      q = q.order("created_at", { ascending: true });
    } else {
      q = q.order("created_at", { ascending: false });
    }

    if (data.search) {
      const s = data.search.replace(/[%_,]/g, " ");
      q = q.or(`nome.ilike.%${s}%,phone_e164.ilike.%${s}%,cidade.ilike.%${s}%,bairro.ilike.%${s}%`);
    }
    const { data: rows } = await q;

    // Logs do próprio usuário para deduzir última ação por contato.
    const { data: logs } = await context.supabase
      .from("agitacao_contact_logs")
      .select("contact_id, action, note, created_at, user_id")
      .eq("user_id", context.userId)
      .in("contact_id", ids)
      .is("hidden_at", null)
      .order("created_at", { ascending: false });

    type Log = { contact_id: string; action: string; note: string | null; created_at: string; user_id: string };
    const lastByContact = new Map<string, Log>();
    for (const l of (logs ?? []) as Log[]) {
      if (!lastByContact.has(l.contact_id)) lastByContact.set(l.contact_id, l);
    }

    const enriched = (rows ?? []).map((r) => {
      const la = lastByContact.get(r.id) ?? null;
      return {
        ...r,
        last_action: la,
        contato_realizado: (logs ?? []).some((l) => l.contact_id === r.id && l.action === "contato_realizado"),
      };
    });

    // Contadores por status (universo total do usuário, antes de filtro).
    const counts = {
      nao_abordado: enriched.filter((r) => !r.last_action).length,
      confirmado: enriched.filter((r) => r.last_action?.action === "contato_realizado").length,
      sem_resposta: enriched.filter((r) => r.last_action?.action === "nao_respondeu").length,
      observacao: enriched.filter((r) => r.last_action?.action === "observacao").length,
      pediu_atualizacao: enriched.filter((r) => r.last_action?.action === "pediu_atualizacao").length,
    };

    // Aplicação de filtros.
    let filtered = enriched;

    // Novo: chips por última ação.
    const fs = new Set(data.fieldStatus ?? []);
    if (fs.size > 0) {
      filtered = filtered.filter((r) => {
        const la = r.last_action?.action ?? null;
        if (fs.has("nao_abordado") && la === null) return true;
        if (fs.has("confirmado") && la === "contato_realizado") return true;
        if (fs.has("sem_resposta") && la === "nao_respondeu") return true;
        if (fs.has("observacao") && la === "observacao") return true;
        if (fs.has("pediu_atualizacao") && la === "pediu_atualizacao") return true;
        return false;
      });
    }

    // Compat com toggles antigos.
    if (data.pendentes_atualizacao) {
      filtered = filtered.filter((r) => r.lifecycle_status !== "recadastro_concluido");
    }
    if (data.sem_contato_realizado) {
      filtered = filtered.filter((r) => !r.contato_realizado);
    }

    // Refino client-side de "nao_abordado_first".
    if (data.sortBy === "nao_abordado_first") {
      filtered.sort((a, b) => {
        const aHas = a.last_action ? 1 : 0;
        const bHas = b.last_action ? 1 : 0;
        return aHas - bHas;
      });
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
    return { rows: filtered, stats, counts };
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

function emptyCounts() {
  return { nao_abordado: 0, confirmado: 0, sem_resposta: 0, observacao: 0, pediu_atualizacao: 0 };
}

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

// Painel de desempenho das Missões de Agitação (somente leitura).
// Não escreve nada: apenas agrega agitation_tasks por responsável e por missão,
// usando o vocabulário único de status de src/lib/agitation-task-status.ts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { taskStatusFilterKey } from "@/lib/agitation-task-status";

const performanceSchema = z.object({
  visibility: z.enum(["all", "active", "archived"]).default("active"),
  days: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(0)]).default(30),
});

export type PerformanceTotals = {
  total: number;
  enviados: number;
  pendentes: number;
  nao_enviados: number;
  arquivados: number;
  atribuidos: number;
  /** Atribuídos, sem nenhuma ação e parados há mais de 2 horas. */
  parados: number;
};

export type AssigneePerformance = PerformanceTotals & {
  key: string;
  nome: string;
  tipo: "conta" | "link";
  /** id do usuário (tipo "conta") ou do contato (tipo "link"). */
  refId: string;
  /** id do usuário no app, quando existe — mesmo quando a tarefa veio por link. */
  userId: string | null;
  ultima_acao: string | null;
};



export type MissionPerformance = PerformanceTotals & {
  id: string;
  title: string;
  created_at: string;
  paused_at: string | null;
  archived_at: string | null;
  is_open: boolean;
  responsaveis: number;
};

function emptyTotals(): PerformanceTotals {
  return {
    total: 0,
    enviados: 0,
    pendentes: 0,
    nao_enviados: 0,
    arquivados: 0,
    atribuidos: 0,
    parados: 0,
  };
}

const STALLED_CUTOFF_MS = 2 * 60 * 60 * 1000;

function addTask(
  acc: PerformanceTotals,
  status: string | null,
  hasAssignment: boolean,
  assignedAt?: string | null,
) {
  acc.total++;
  if (hasAssignment) acc.atribuidos++;
  const key = taskStatusFilterKey(status);
  if (key === "enviado") acc.enviados++;
  else if (key === "pendente") acc.pendentes++;
  else if (key === "arquivados") acc.arquivados++;
  else acc.nao_enviados++;
  // Mesma régua da liberação automática: sem ação + parado há mais de 2h.
  if (
    hasAssignment &&
    key !== "enviado" &&
    key !== "pendente" &&
    key !== "arquivados" &&
    assignedAt &&
    Date.parse(assignedAt) < Date.now() - STALLED_CUTOFF_MS
  ) {
    acc.parados++;
  }
}

export const getMissionsPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => performanceSchema.parse(d ?? {}))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      geral: PerformanceTotals;
      assignees: AssigneePerformance[];
      missions: MissionPerformance[];
    }> => {
      let mq = context.supabase
        .from("agitation_missions")
        .select("id,title,created_at,paused_at,archived_at,is_open")
        .order("created_at", { ascending: false });
      if (data.visibility === "active") mq = mq.is("archived_at", null);
      else if (data.visibility === "archived") mq = mq.not("archived_at", "is", null);
      if (data.days > 0) {
        const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
        mq = mq.gte("created_at", since);
      }
      const { data: missions, error } = await mq;
      if (error) throw error;
      if (!missions?.length) return { geral: emptyTotals(), assignees: [], missions: [] };

      const ids = missions.map((m) => m.id);
      const { data: tasks, error: e2 } = await context.supabase
        .from("agitation_tasks")
        .select("mission_id,status,assigned_user_id,assigned_contact_id,assigned_at,assigned_to_user_at,updated_at")
        .in("mission_id", ids);
      if (e2) throw e2;

      const geral = emptyTotals();
      const byMission = new Map<string, PerformanceTotals & { responsaveis: Set<string> }>();
      const byAssignee = new Map<
        string,
        PerformanceTotals & { tipo: "conta" | "link"; refId: string; ultima_acao: string | null }
      >();

      for (const t of tasks ?? []) {
        const hasAssignment = !!(t.assigned_contact_id || t.assigned_user_id);
        addTask(geral, t.status, hasAssignment, t.assigned_to_user_at);

        const m = byMission.get(t.mission_id) ?? { ...emptyTotals(), responsaveis: new Set<string>() };
        addTask(m, t.status, hasAssignment, t.assigned_to_user_at);
        if (!hasAssignment) {
          byMission.set(t.mission_id, m);
          continue;
        }
        const tipo: "conta" | "link" = t.assigned_user_id ? "conta" : "link";
        const refId = (t.assigned_user_id ?? t.assigned_contact_id) as string;
        const key = `${tipo}:${refId}`;
        m.responsaveis.add(key);
        byMission.set(t.mission_id, m);

        const a =
          byAssignee.get(key) ?? { ...emptyTotals(), tipo, refId, ultima_acao: null as string | null };
        addTask(a, t.status, hasAssignment, t.assigned_to_user_at);
        const stamp = t.updated_at ?? t.assigned_at ?? null;
        if (stamp && (!a.ultima_acao || stamp > a.ultima_acao)) a.ultima_acao = stamp;
        byAssignee.set(key, a);
      }

      // Nomes dos responsáveis
      const contactIds = [...byAssignee.values()].filter((a) => a.tipo === "link").map((a) => a.refId);
      const userIds = [...byAssignee.values()].filter((a) => a.tipo === "conta").map((a) => a.refId);
      const nameByContact = new Map<string, string | null>();
      const nameByUser = new Map<string, string | null>();
      if (contactIds.length) {
        const { data: cs } = await context.supabase
          .from("contacts")
          .select("id,nome")
          .in("id", contactIds);
        (cs ?? []).forEach((c) => nameByContact.set(c.id, c.nome));
      }
      if (userIds.length) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ps } = await supabaseAdmin
          .from("profiles")
          .select("id,full_name")
          .in("id", userIds);
        (ps ?? []).forEach((p) => nameByUser.set(p.id, p.full_name));
      }

      const assignees: AssigneePerformance[] = [...byAssignee.entries()]
        .map(([key, a]) => {
          const { tipo, refId, ultima_acao, ...totals } = a;
          const nome =
            (tipo === "conta" ? nameByUser.get(refId) : nameByContact.get(refId)) ?? "Sem nome";
          return { key, nome, tipo, refId, ultima_acao, ...totals };
        })
        .sort((x, y) => y.enviados - x.enviados || y.total - x.total);

      const missionRows: MissionPerformance[] = missions.map((m) => {
        const s = byMission.get(m.id);
        const { responsaveis, ...totals } = s ?? { ...emptyTotals(), responsaveis: new Set<string>() };
        return { ...m, ...totals, responsaveis: responsaveis.size };
      });

      return { geral, assignees, missions: missionRows };
    },
  );

// Atribuição de Missões de Agitação: admin cria uma missão (título + mensagem
// padronizada) a partir de um grupo de contatos, e atribui manualmente pacotes
// desse grupo a um responsável — que pode ser QUALQUER contato da base (não
// precisa ter conta no sistema), já que ele só recebe um link exclusivo
// (/missao/$missionId/contato/$contactId) e não precisa fazer login pra usá-lo.
// Por isso agitation_tasks.assigned_contact_id referencia contacts, não
// auth.users — ver migration 20260717160000 pra correção histórica disso.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crmFilterSchema, applyCrmFilters, type CrmFilters } from "@/lib/crm-filters";

// ===== Criar missão a partir da seleção do CRM =====
const createMissionSchema = z.object({
  title: z.string().trim().min(2).max(160),
  message_template: z.string().min(1).max(4000),
  ids: z.array(z.string().uuid()).max(20000).optional(),
  filters: crmFilterSchema.partial().optional(),
});

export const createAgitationMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createMissionSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Resolve audiência -> IDs (mesmo padrão de createCampaignFromSelection).
    let baseIds = data.ids ?? [];
    if (!baseIds.length && data.filters) {
      let q = context.supabase.from("contacts").select("id").limit(20000);
      q = applyCrmFilters(q as never, data.filters as CrmFilters) as typeof q;
      if (data.filters.tag_ids?.length) {
        const { data: rels } = await context.supabase
          .from("contact_tags")
          .select("contact_id")
          .in("tag_id", data.filters.tag_ids);
        const relIds = Array.from(new Set((rels ?? []).map((r) => r.contact_id)));
        if (relIds.length) {
          const { data: rows } = await q.in("id", relIds);
          baseIds = (rows ?? []).map((r) => r.id);
        }
      } else {
        const { data: rows } = await q;
        baseIds = (rows ?? []).map((r) => r.id);
      }
    }
    if (!baseIds.length) throw new Error("Nenhum contato selecionado.");

    const { data: mission, error } = await context.supabase
      .from("agitation_missions")
      .insert({
        title: data.title,
        message_template: data.message_template,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw error;

    const rows = baseIds.map((contact_id) => ({ mission_id: mission.id, contact_id }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: e2 } = await context.supabase.from("agitation_tasks").insert(chunk);
      if (e2) throw e2;
    }

    return { ok: true as const, mission_id: mission.id, total: baseIds.length };
  });

// ===== Listagem de missões (com contagens) =====
export const listAgitationMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: missions, error } = await context.supabase
      .from("agitation_missions")
      .select("id,title,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (!missions?.length) return { missions: [] as Array<Record<string, unknown>> };

    const ids = missions.map((m) => m.id);
    const { data: tasks } = await context.supabase
      .from("agitation_tasks")
      .select("mission_id,status,assigned_contact_id")
      .in("mission_id", ids);

    const stats = new Map<
      string,
      { total: number; atribuidos: number; pendentes: number; concluidos: number }
    >();
    for (const t of tasks ?? []) {
      const s = stats.get(t.mission_id) ?? { total: 0, atribuidos: 0, pendentes: 0, concluidos: 0 };
      s.total++;
      if (t.assigned_contact_id) s.atribuidos++;
      if (t.status === "concluido") s.concluidos++;
      else if (!t.assigned_contact_id) s.pendentes++;
      stats.set(t.mission_id, s);
    }

    return {
      missions: missions.map((m) => ({
        ...m,
        ...(stats.get(m.id) ?? { total: 0, atribuidos: 0, pendentes: 0, concluidos: 0 }),
      })),
    };
  });

// ===== Detalhe de uma missão (tasks + contato + responsável) =====
const missionIdSchema = z.object({ mission_id: z.string().uuid() });

export const getMissionDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: mission, error } = await context.supabase
      .from("agitation_missions")
      .select("id,title,message_template,created_at")
      .eq("id", data.mission_id)
      .single();
    if (error) throw error;

    const { data: tasks, error: e2 } = await context.supabase
      .from("agitation_tasks")
      .select("id,status,assigned_contact_id,created_at,contacts(id,nome,phone_e164,cidade)")
      .eq("mission_id", data.mission_id)
      .order("created_at", { ascending: true });
    if (e2) throw e2;

    const assignedIds = Array.from(
      new Set((tasks ?? []).map((t) => t.assigned_contact_id).filter((v): v is string => !!v)),
    );
    const nameById = new Map<string, string | null>();
    if (assignedIds.length) {
      const { data: assignedContacts } = await context.supabase
        .from("contacts")
        .select("id,nome")
        .in("id", assignedIds);
      (assignedContacts ?? []).forEach((c) => nameById.set(c.id, c.nome));
    }

    return {
      mission,
      tasks: (tasks ?? []).map((t) => ({
        id: t.id,
        status: t.status,
        assigned_contact_id: t.assigned_contact_id,
        assigned_contact_name: t.assigned_contact_id
          ? (nameById.get(t.assigned_contact_id) ?? null)
          : null,
        contact: t.contacts,
      })),
    };
  });

// ===== Candidatos a responsável (filtros "Faz parte do Coletivo Alicerce" + "Formas de ajuda") =====
const candidatesSchema = z.object({
  coletivo_alicerce: z.boolean().optional(),
  formas_ajuda: z.array(z.string()).optional(),
});

export const listAgitadorCandidates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => candidatesSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    // Qualquer contato da base pode ser responsável (não precisa ter conta no
    // sistema — o link público não exige login) — reaproveita os dois filtros
    // já existentes no CRM (crm-filters.ts) sem duplicar a lógica.
    let q = context.supabase
      .from("contacts")
      .select("id,nome,coletivo_alicerce,formas_ajuda")
      .limit(500);
    q = applyCrmFilters(q as never, data as CrmFilters) as typeof q;
    const { data: contatos, error } = await q;
    if (error) throw error;

    return {
      candidates: (contatos ?? []).map((c) => ({
        contact_id: c.id,
        nome: c.nome,
        coletivo_alicerce: c.coletivo_alicerce,
        formas_ajuda: c.formas_ajuda,
      })),
    };
  });

// ===== Atribuir responsável a um lote de tasks =====
const assignSchema = z.object({
  mission_id: z.string().uuid(),
  task_ids: z.array(z.string().uuid()).min(1).max(2000),
  assigned_contact_id: z.string().uuid(),
});

export const assignMissionTaskResponsible = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .from("agitation_tasks")
      .update({ assigned_contact_id: data.assigned_contact_id })
      .eq("mission_id", data.mission_id)
      .in("id", data.task_ids)
      .is("assigned_contact_id", null)
      .select("id");
    if (error) throw error;

    return {
      ok: true as const,
      updated: updated?.length ?? 0,
      link: `/missao/${data.mission_id}/contato/${data.assigned_contact_id}`,
    };
  });

// As rotas públicas (sem login) usadas pelo link exclusivo do executor não vivem
// aqui — seguem o mesmo padrão dos outros dados públicos do sistema (fetch a uma
// rota REST em src/routes/api/public/*, não um createServerFn autenticável por
// engano): ver src/routes/api/public/agitation-missions/$missionId/$contactId.ts.

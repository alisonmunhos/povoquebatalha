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
  // Quando true, roda a mesma checagem real de WhatsApp (Z-API) já usada em
  // "Verificar no WhatsApp" da Gestão da Base antes de criar as tarefas —
  // mais lento, mas garante que só entra quem tem WhatsApp confirmado.
  verify_whatsapp: z.boolean().optional(),
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

    // Sempre exclui quem não tem telefone nenhum cadastrado.
    const { data: contatos, error: cErr } = await context.supabase
      .from("contacts")
      .select("id,phone_e164,phone_whatsapp_candidate")
      .in("id", baseIds);
    if (cErr) throw cErr;
    const comTelefone = (contatos ?? []).filter((c) => !!c.phone_e164);
    const ignorados_sem_telefone = baseIds.length - comTelefone.length;

    let elegiveis = comTelefone;
    let ignorados_sem_whatsapp = 0;
    if (data.verify_whatsapp && comTelefone.length) {
      const { zapi, hasZapiEnv } = await import("@/integrations/zapi/client.server");
      if (!hasZapiEnv()) {
        throw new Error(
          "Z-API não está configurada. Configure ZAPI_INSTANCE_ID/TOKEN/CLIENT_TOKEN.",
        );
      }
      const checkable = comTelefone
        .map((c) => ({
          id: c.id,
          phone: (c.phone_whatsapp_candidate ?? c.phone_e164 ?? "").replace(/\D+/g, ""),
        }))
        .filter((c) => c.phone.length >= 10);
      if (checkable.length) {
        let results: Array<{ exists?: boolean; inputPhone?: string }> | null = null;
        try {
          results = await zapi.phoneExistsBatch(checkable.map((c) => c.phone));
        } catch {
          // Falha na chamada em lote inteira — não bloqueia a missão, só não
          // filtra por WhatsApp (mesma postura de checkWhatsappForContacts):
          // mantém `elegiveis` como já estava (comTelefone), sem marcar nada.
        }
        if (results) {
          const nowIso = new Date().toISOString();
          const confirmedIds = new Set<string>();
          const byPhone = new Map(
            results.map((r) => [(r.inputPhone ?? "").replace(/\D+/g, ""), r] as const),
          );
          for (const { id, phone } of checkable) {
            const res = byPhone.get(phone);
            const exists = Boolean(res?.exists);
            if (exists) confirmedIds.add(id);
            await context.supabase
              .from("contacts")
              .update({
                whatsapp_status: exists ? "confirmado" : "invalido",
                whatsapp_checked_at: nowIso,
              } as never)
              .eq("id", id);
          }
          elegiveis = comTelefone.filter((c) => confirmedIds.has(c.id));
          ignorados_sem_whatsapp = comTelefone.length - elegiveis.length;
        }
      }
    }
    if (!elegiveis.length)
      throw new Error("Nenhum contato elegível (com telefone válido) restou após os filtros.");

    const { data: mission, error } = await context.supabase
      .from("agitation_missions")
      .insert({
        title: data.title,
        message_template: data.message_template,
        created_by: context.userId,
        source_filters: (!data.ids && data.filters ? data.filters : null) as never,
      })
      .select("id")
      .single();
    if (error) throw error;

    const rows = elegiveis.map((c) => ({ mission_id: mission.id, contact_id: c.id }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error: e2 } = await context.supabase.from("agitation_tasks").insert(chunk);
      if (e2) throw e2;
    }

    return {
      ok: true as const,
      mission_id: mission.id,
      total: elegiveis.length,
      ignorados_sem_telefone,
      ignorados_sem_whatsapp,
    };
  });

// ===== Editar título/mensagem de uma missão já criada =====
const updateMissionSchema = z.object({
  mission_id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  message_template: z.string().min(1).max(4000),
});

export const updateAgitationMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateMissionSchema.parse(d))
  .handler(async ({ data, context }) => {
    // A mensagem é sempre renderizada na hora (não congelada), então editar
    // aqui já reflete em todos os links ativos automaticamente.
    const { error } = await context.supabase
      .from("agitation_missions")
      .update({ title: data.title, message_template: data.message_template })
      .eq("id", data.mission_id);
    if (error) throw error;
    return { ok: true as const };
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
    if (!missions?.length) {
      return {
        missions: [] as Array<{
          id: string;
          title: string;
          created_at: string;
          total: number;
          atribuidos: number;
          pendentes: number;
          concluidos: number;
        }>,
      };
    }

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
      .select("id,title,message_template,created_at,source_filters,paused_at")
      .eq("id", data.mission_id)
      .single();
    if (error) throw error;

    const { data: tasks, error: e2 } = await context.supabase
      .from("agitation_tasks")
      .select(
        "id,status,assigned_contact_id,assigned_at,created_at,contacts!agitation_tasks_contact_id_fkey(id,nome,phone_e164,cidade)",
      )
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

    const pausedContactIds = new Set<string>();
    if (assignedIds.length) {
      const { data: pauses } = await context.supabase
        .from("agitation_link_pauses")
        .select("contact_id")
        .eq("mission_id", data.mission_id)
        .in("contact_id", assignedIds);
      (pauses ?? []).forEach((p) => pausedContactIds.add(p.contact_id));
    }

    // Agrupa as tarefas já atribuídas por responsável — resolve "ver os links
    // atribuídos" sem precisar de uma tabela própria de atribuição.
    const linkStats = new Map<
      string,
      {
        contact_id: string;
        nome: string | null;
        total: number;
        concluidos: number;
        nao_enviados: number;
        pendentes: number;
      }
    >();
    for (const t of tasks ?? []) {
      if (!t.assigned_contact_id) continue;
      const s = linkStats.get(t.assigned_contact_id) ?? {
        contact_id: t.assigned_contact_id,
        nome: nameById.get(t.assigned_contact_id) ?? null,
        total: 0,
        concluidos: 0,
        nao_enviados: 0,
        pendentes: 0,
      };
      s.total++;
      if (t.status === "concluido") s.concluidos++;
      else if (t.status === "nao_enviado") s.nao_enviados++;
      else s.pendentes++;
      linkStats.set(t.assigned_contact_id, s);
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
        assigned_at: t.assigned_at,
        contact: t.contacts,
      })),
      links: Array.from(linkStats.values()).map((s) => ({
        ...s,
        link: `/missao/${data.mission_id}/contato/${s.contact_id}`,
        paused: pausedContactIds.has(s.contact_id),
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
      .update({
        assigned_contact_id: data.assigned_contact_id,
        assigned_at: new Date().toISOString(),
      })
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

// ===== Desfazer atribuição (volta pra lista de "sem atribuição") =====
const unassignSchema = z.object({ task_ids: z.array(z.string().uuid()).min(1).max(2000) });

export const unassignMissionTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => unassignSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_tasks")
      .update({ assigned_contact_id: null, assigned_at: null, status: "pending" })
      .in("id", data.task_ids);
    if (error) throw error;
    return { ok: true as const, updated: data.task_ids.length };
  });

// ===== Pausar/retomar missão inteira =====
export const pauseMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_missions")
      .update({ paused_at: new Date().toISOString() })
      .eq("id", data.mission_id);
    if (error) throw error;
    return { ok: true as const };
  });

export const resumeMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_missions")
      .update({ paused_at: null })
      .eq("id", data.mission_id);
    if (error) throw error;
    return { ok: true as const };
  });

// ===== Pausar/retomar só o link de um responsável específico =====
const linkPauseSchema = z.object({ mission_id: z.string().uuid(), contact_id: z.string().uuid() });

export const pauseAssignmentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => linkPauseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_link_pauses")
      .upsert({ mission_id: data.mission_id, contact_id: data.contact_id });
    if (error) throw error;
    return { ok: true as const };
  });

export const resumeAssignmentLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => linkPauseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_link_pauses")
      .delete()
      .eq("mission_id", data.mission_id)
      .eq("contact_id", data.contact_id);
    if (error) throw error;
    return { ok: true as const };
  });

// As rotas públicas (sem login) usadas pelo link exclusivo do executor não vivem
// aqui — seguem o mesmo padrão dos outros dados públicos do sistema (fetch a uma
// rota REST em src/routes/api/public/*, não um createServerFn autenticável por
// engano): ver src/routes/api/public/agitation-missions/$missionId/$contactId.ts.

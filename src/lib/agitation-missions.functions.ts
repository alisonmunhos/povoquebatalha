// Atribuição de Missões de Agitação: admin cria uma missão (título + mensagem
// padronizada) a partir de um grupo de contatos, e atribui manualmente pacotes
// desse grupo a um responsável — que pode ser QUALQUER contato da base (não
// precisa ter conta no sistema), já que ele só recebe um link exclusivo
// (/missao/$missionId/contato/$contactId) e não precisa fazer login pra usá-lo.
// Por isso agitation_tasks.assigned_contact_id referencia contacts, não
// auth.users — ver migration 20260717160000 pra correção histórica disso.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { crmFilterSchema, applyCrmFilters, type CrmFilters } from "@/lib/crm-filters";

// ===== Criar missão a partir da seleção do CRM =====
const createMissionSchema = z.object({
  title: z.string().trim().min(2).max(160),
  message_template: z.string().min(1).max(4000),
  ids: z.array(z.string().uuid()).max(20000).optional(),
  filters: crmFilterSchema.partial().optional(),
  verify_whatsapp: z.boolean().optional(),
  instructions: z.string().max(4000).optional(),
  media_path: z.string().max(500).nullable().optional(),
  media_mime: z.string().max(120).nullable().optional(),
  media_filename: z.string().max(200).nullable().optional(),
  batch_size: z.number().int().min(1).max(100).optional(),
  cooldown_minutes: z.number().int().min(0).max(1440).optional(),
});


async function sendMissionNotifications(input: {
  missionId: string;
  missionTitle: string;
  createdBy: string;
  userIds: string[];
  body: string;
  separateBatchPerUser?: boolean;
}) {
  if (!input.userIds.length) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { randomUUID } = await import("node:crypto");
  const insertedAll: Array<{ id: string; user_id: string }> = [];

  if (input.separateBatchPerUser) {
    for (const uid of input.userIds) {
      const batchId = randomUUID();
      const { data: inserted } = await supabaseAdmin
        .from("notifications")
        .insert({
          user_id: uid,
          title: `Nova missão: ${input.missionTitle}`,
          body: input.body,
          kind: "mission",
          cta_label: "Abrir missão",
          cta_kind: "mission",
          cta_payload: { mission_id: input.missionId },
          mission_id: input.missionId,
          created_by: input.createdBy,
          batch_id: batchId,
        } as never)
        .select("id, user_id");
      insertedAll.push(...(inserted ?? []));
    }
  } else {
    const batchId = randomUUID();
    const rows = input.userIds.map((uid) => ({
      user_id: uid,
      title: `Nova missão: ${input.missionTitle}`,
      body: input.body,
      kind: "mission",
      cta_label: "Abrir missão",
      cta_kind: "mission",
      cta_payload: { mission_id: input.missionId },
      mission_id: input.missionId,
      created_by: input.createdBy,
      batch_id: batchId,
    }));
    const { data: inserted } = await supabaseAdmin
      .from("notifications")
      .insert(rows as never)
      .select("id, user_id");
    insertedAll.push(...(inserted ?? []));
  }

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth")
    .in("user_id", input.userIds);
  if (!subs?.length) return;

  const { sendWebPush } = await import("@/lib/web-push.server");
  const firstByUser = new Map<string, string>();
  for (const r of insertedAll) if (!firstByUser.has(r.user_id)) firstByUser.set(r.user_id, r.id);

  await Promise.allSettled(
    subs
      .filter((s): s is typeof s & { user_id: string } => s.user_id != null)
      .map(async (s) => {
        const notifId = firstByUser.get(s.user_id);
        const r = await sendWebPush(
          { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
          {
            title: `Nova missão: ${input.missionTitle}`,
            body: input.body,
            url: "/minhas-missoes",
            notificationId: notifId ?? null,
            tag: `mission-${input.missionId}`,
          },
        );
        if (r.gone) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }),
  );
}

async function defaultAgitadorUserIds(): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .in("role", ["agitador", "admin", "operador"] as never);
  return Array.from(new Set((rows ?? []).map((r) => r.user_id)));
}

async function assertMissionAssignable(
  supabase: SupabaseClient<Database>,
  missionId: string,
) {
  const { data: mission, error } = await supabase
    .from("agitation_missions")
    .select("archived_at")
    .eq("id", missionId)
    .single();
  if (error || !mission) throw new Error("Missão não encontrada.");
  if (mission.archived_at) throw new Error("Missão arquivada — novas atribuições bloqueadas.");
}

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
          // ignore
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
        is_open: false,
        instructions: data.instructions ?? null,
        media_path: data.media_path ?? null,
        media_mime: data.media_mime ?? null,
        media_filename: data.media_filename ?? null,
        ...(data.batch_size !== undefined ? { batch_size: data.batch_size } : {}),
        ...(data.cooldown_minutes !== undefined ? { cooldown_minutes: data.cooldown_minutes } : {}),
      } as never)
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

// ===== Anexo de imagem da missão (reaproveita o bucket de mídia de campanha) =====
export const signMissionMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().trim().min(1).max(200),
        contentType: z.string().trim().min(1).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (!allowed.includes(data.contentType)) throw new Error("Tipo não permitido. Use PNG, JPG ou WEBP.");
    const clean = data.filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const path = `missoes/${context.userId}/${Date.now()}_${clean}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("campaign-media")
      .createSignedUploadUrl(path);
    if (error) throw error;
    return { path, token: signed.token, signedUrl: signed.signedUrl, contentType: data.contentType, filename: clean };
  });

/** Gera um link temporário para o agitador ver/baixar a imagem da missão. */
export const getMissionMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ path: z.string().min(1).max(500) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("campaign-media")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

// ===== Editar título/mensagem de uma missão já criada =====
const updateMissionSchema = z.object({
  mission_id: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  message_template: z.string().min(1).max(4000),
  media_path: z.string().max(500).nullable().optional(),
  media_mime: z.string().max(120).nullable().optional(),
  media_filename: z.string().max(200).nullable().optional(),
  batch_size: z.number().int().min(1).max(100).optional(),
  cooldown_minutes: z.number().int().min(0).max(1440).optional(),
  instructions: z.string().max(4000).nullable().optional(),
});

export const updateAgitationMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateMissionSchema.parse(d))
  .handler(async ({ data, context }) => {
    // A mensagem é sempre renderizada na hora (não congelada), então editar
    // aqui já reflete em todos os links ativos automaticamente.
    const row: Record<string, unknown> = {
      title: data.title,
      message_template: data.message_template,
    };
    if (data.media_path !== undefined) {
      row.media_path = data.media_path;
      row.media_mime = data.media_mime ?? null;
      row.media_filename = data.media_filename ?? null;
    }
    if (data.batch_size !== undefined) row.batch_size = data.batch_size;
    if (data.cooldown_minutes !== undefined) row.cooldown_minutes = data.cooldown_minutes;
    if (data.instructions !== undefined) {
      const txt = (data.instructions ?? "").trim();
      row.instructions = txt.length ? txt : null;
    }
    const { error } = await context.supabase
      .from("agitation_missions")
      .update(row as never)
      .eq("id", data.mission_id);
    if (error) throw error;
    return { ok: true as const };

  });

// ===== Listagem de missões (com contagens) =====
export type MissionSummary = {
  id: string;
  title: string;
  created_at: string;
  paused_at: string | null;
  archived_at: string | null;
  is_open: boolean;
  total: number;
  atribuidos: number;
  pendentes: number;
  concluidos: number;
};

const listMissionsSchema = z.object({
  visibility: z.enum(["all", "active", "archived"]).default("active"),
});

export const listAgitationMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listMissionsSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ missions: MissionSummary[] }> => {
    let q = context.supabase
      .from("agitation_missions")
      .select("id,title,created_at,paused_at,archived_at,is_open")
      .order("created_at", { ascending: false });
    if (data.visibility === "active") {
      q = q.is("archived_at", null);
    } else if (data.visibility === "archived") {
      q = q.not("archived_at", "is", null);
    }
    const { data: missions, error } = await q;
    if (error) throw error;
    if (!missions?.length) return { missions: [] };

    const ids = missions.map((m) => m.id);
    const { data: tasks } = await context.supabase
      .from("agitation_tasks")
      .select("mission_id,status,assigned_contact_id,assigned_user_id")
      .in("mission_id", ids);

    const stats = new Map<
      string,
      { total: number; atribuidos: number; pendentes: number; concluidos: number }
    >();
    for (const t of tasks ?? []) {
      const s = stats.get(t.mission_id) ?? { total: 0, atribuidos: 0, pendentes: 0, concluidos: 0 };
      s.total++;
      const hasAssignment = !!(t.assigned_contact_id || t.assigned_user_id);
      if (hasAssignment) s.atribuidos++;
      if (t.status === "concluido") s.concluidos++;
      else if (!hasAssignment) s.pendentes++;
      stats.set(t.mission_id, s);
    }

    return {
      missions: missions.map((m) => ({
        ...m,
        ...(stats.get(m.id) ?? { total: 0, atribuidos: 0, pendentes: 0, concluidos: 0 }),
      })),
    };
  });

export const listMissionTemplatesForReuse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agitation_missions")
      .select("id,title,message_template,instructions,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return { missions: data ?? [] };
  });

// ===== Detalhe de uma missão (tasks + contato + responsável) =====
const missionIdSchema = z.object({ mission_id: z.string().uuid() });

export const getMissionDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: mission, error } = await context.supabase
      .from("agitation_missions")
      .select(
        "id,title,message_template,instructions,created_at,source_filters,paused_at,archived_at,is_open,batch_size,cooldown_minutes,opened_at,media_path,media_mime,media_filename",
      )
      .eq("id", data.mission_id)
      .single();
    if (error) throw error;

    const { data: tasks, error: e2 } = await context.supabase
      .from("agitation_tasks")
      .select(
        "id,status,assigned_contact_id,assigned_user_id,assigned_at,created_at,contacts!agitation_tasks_contact_id_fkey(id,nome,phone_e164,phone_raw,cidade,opt_out_at,arquivado_at)",
      )
      .eq("mission_id", data.mission_id)
      .order("created_at", { ascending: true });
    if (e2) throw e2;

    const assignedContactIds = Array.from(
      new Set((tasks ?? []).map((t) => t.assigned_contact_id).filter((v): v is string => !!v)),
    );
    const assignedUserIds = Array.from(
      new Set((tasks ?? []).map((t) => t.assigned_user_id).filter((v): v is string => !!v)),
    );
    const nameByContactId = new Map<string, string | null>();
    if (assignedContactIds.length) {
      const { data: assignedContacts } = await context.supabase
        .from("contacts")
        .select("id,nome")
        .in("id", assignedContactIds);
      (assignedContacts ?? []).forEach((c) => nameByContactId.set(c.id, c.nome));
    }
    const nameByUserId = new Map<string, string | null>();
    if (assignedUserIds.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name")
        .in("id", assignedUserIds);
      (profs ?? []).forEach((p) => nameByUserId.set(p.id, p.full_name));
    }

    const pausedContactIds = new Set<string>();
    if (assignedContactIds.length) {
      const { data: pauses } = await context.supabase
        .from("agitation_link_pauses")
        .select("contact_id")
        .eq("mission_id", data.mission_id)
        .in("contact_id", assignedContactIds);
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
        nome: nameByContactId.get(t.assigned_contact_id) ?? null,
        total: 0,
        concluidos: 0,
        nao_enviados: 0,
        pendentes: 0,
      };
      s.total++;
      if (t.status === "concluido") s.concluidos++;
      else if (t.status === "nao_enviado" || t.status === "erro_numero") s.nao_enviados++;
      else s.pendentes++;
      linkStats.set(t.assigned_contact_id, s);
    }

    // Todos os responsáveis possíveis (link avulso + agitador com conta),
    // para o filtro "Responsável" do painel não ficar só com os links.
    const assignees = [
      ...assignedContactIds.map((id) => ({
        kind: "link" as const,
        id,
        nome: nameByContactId.get(id) ?? null,
      })),
      ...assignedUserIds.map((id) => ({
        kind: "conta" as const,
        id,
        nome: nameByUserId.get(id) ?? null,
      })),
    ];

    return {
      mission,
      assignees,
      tasks: (tasks ?? []).map((t) => ({
        id: t.id,
        status: t.status,
        assigned_contact_id: t.assigned_contact_id,
        assigned_user_id: t.assigned_user_id,
        assigned_contact_name: t.assigned_contact_id
          ? (nameByContactId.get(t.assigned_contact_id) ?? null)
          : null,
        assigned_user_name: t.assigned_user_id
          ? (nameByUserId.get(t.assigned_user_id) ?? null)
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
      .limit(500)
      .order("nome", { ascending: true });
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
    await assertMissionAssignable(context.supabase, data.mission_id);

    const { data: updated, error } = await context.supabase
      .from("agitation_tasks")
      .update({
        assigned_contact_id: data.assigned_contact_id,
        assigned_at: new Date().toISOString(),
      })
      .eq("mission_id", data.mission_id)
      .in("id", data.task_ids)
      .is("assigned_contact_id", null)
      .is("assigned_user_id", null)
      .select("id");
    if (error) throw error;

    return {
      ok: true as const,
      updated: updated?.length ?? 0,
      link: `/missao/${data.mission_id}/contato/${data.assigned_contact_id}`,
    };
  });

// ===== Desfazer atribuição (volta pra lista de "sem atribuição") =====
const unassignSchema = z.object({
  mission_id: z.string().uuid(),
  task_ids: z.array(z.string().uuid()).min(1).max(2000),
});

export const unassignMissionTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => unassignSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: before, error: fetchErr } = await context.supabase
      .from("agitation_tasks")
      .select("id, assigned_user_id")
      .eq("mission_id", data.mission_id)
      .in("id", data.task_ids);
    if (fetchErr) throw fetchErr;

    const affectedUserIds = Array.from(
      new Set(
        (before ?? [])
          .map((t) => t.assigned_user_id)
          .filter((v): v is string => !!v),
      ),
    );

    const { error } = await context.supabase
      .from("agitation_tasks")
      .update({
        assigned_contact_id: null,
        assigned_at: null,
        assigned_user_id: null,
        claim_id: null,
        assigned_to_user_at: null,
        status: "pending",
      } as never)
      .eq("mission_id", data.mission_id)
      .in("id", data.task_ids);
    if (error) throw error;

    const now = new Date().toISOString();
    for (const userId of affectedUserIds) {
      const { count } = await context.supabase
        .from("agitation_tasks")
        .select("id", { count: "exact", head: true })
        .eq("mission_id", data.mission_id)
        .eq("assigned_user_id", userId);
      if ((count ?? 0) === 0) {
        await context.supabase
          .from("notifications")
          .update({ cancelled_at: now, cancelled_by: context.userId } as never)
          .eq("mission_id", data.mission_id)
          .eq("user_id", userId)
          .eq("kind", "mission")
          .is("cancelled_at", null);
      }
    }

    return { ok: true as const, updated: data.task_ids.length };
  });

// ===== Pausar/retomar missão inteira =====
// "Pausar" agora é uma interrupção completa: libera tasks não concluídas,
// fecha claims abertas e cancela notificações pendentes ligadas à missão.
export const pauseMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_missions")
      .update({ paused_at: new Date().toISOString() })
      .eq("id", data.mission_id);
    if (error) throw error;

    // Libera tasks/claims + cancela notificações pendentes da missão.
    const { error: relErr } = await context.supabase.rpc(
      "release_mission_pending" as never,
      { _mission_id: data.mission_id } as never,
    );
    if (relErr) throw relErr;
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

export const archiveMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_missions")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.mission_id);
    if (error) throw error;
    return { ok: true as const };
  });

export const unarchiveMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_missions")
      .update({ archived_at: null })
      .eq("id", data.mission_id);
    if (error) throw error;
    return { ok: true as const };
  });

const openMissionSchema = z.object({
  mission_id: z.string().uuid(),
  batch_size: z.number().int().min(1).max(100),
  cooldown_minutes: z.number().int().min(0).max(1440),
  eligible_user_ids: z.array(z.string().uuid()).optional(),
  coordinator_phone: z.string().max(40).optional(),
  whatsapp_message_template: z.string().max(2000).optional(),
});

export const openMissionForSelfAssign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => openMissionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMissionAssignable(context.supabase, data.mission_id);

    const { data: mission, error: mErr } = await context.supabase
      .from("agitation_missions")
      .select("id,title,is_open,opened_at")
      .eq("id", data.mission_id)
      .single();
    if (mErr || !mission) throw new Error("Missão não encontrada.");

    const { count: available } = await context.supabase
      .from("agitation_tasks")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", data.mission_id)
      .is("assigned_user_id", null)
      .is("assigned_contact_id", null)
      .eq("status", "pending");
    if (!(available ?? 0)) throw new Error("Não há contatos disponíveis para auto-atribuição.");

    let eligibleIds = data.eligible_user_ids?.length
      ? data.eligible_user_ids
      : await defaultAgitadorUserIds();
    eligibleIds = Array.from(new Set(eligibleIds));
    if (!eligibleIds.length) throw new Error("Nenhum agitador elegível encontrado.");

    const now = new Date().toISOString();
    const updateRow = {
      is_open: true,
      batch_size: data.batch_size,
      cooldown_minutes: data.cooldown_minutes,
      coordinator_phone: data.coordinator_phone ?? null,
      whatsapp_message_template: data.whatsapp_message_template ?? null,
      open_notified_at: now,
      ...(mission.is_open ? {} : { opened_at: now }),
    };
    const { error: updErr } = await context.supabase
      .from("agitation_missions")
      .update(updateRow as never)
      .eq("id", data.mission_id);
    if (updErr) throw updErr;

    await context.supabase
      .from("agitation_mission_eligible_users")
      .delete()
      .eq("mission_id", data.mission_id);
    await context.supabase.from("agitation_mission_eligible_users").insert(
      eligibleIds.map((user_id) => ({ mission_id: data.mission_id, user_id })),
    );

    const openBody = `Missão aberta com ${available} contato(s) disponíveis. Pegue seu lote.`;
    try {
      await sendMissionNotifications({
        missionId: data.mission_id,
        missionTitle: mission.title,
        createdBy: context.userId,
        userIds: eligibleIds,
        body: openBody,
      });
    } catch (e) {
      console.error("[missão] falha ao notificar abertura", e);
    }

    return { ok: true as const, notified: eligibleIds.length, available: available ?? 0 };
  });

const assignUsersSchema = z.object({
  mission_id: z.string().uuid(),
  task_ids: z.array(z.string().uuid()).min(1).max(2000),
  user_ids: z.array(z.string().uuid()).min(1).max(50),
});

export const assignMissionUsersFromDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assignUsersSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertMissionAssignable(context.supabase, data.mission_id);

    const { data: mission, error: mErr } = await context.supabase
      .from("agitation_missions")
      .select("title")
      .eq("id", data.mission_id)
      .single();
    if (mErr || !mission) throw new Error("Missão não encontrada.");

    const userIds = data.user_ids;
    const chunks: string[][] = userIds.map(() => []);
    data.task_ids.forEach((taskId, i) => {
      chunks[i % userIds.length]!.push(taskId);
    });

    let totalAssigned = 0;
    const assignedByUser = new Map<string, number>();

    for (let i = 0; i < userIds.length; i++) {
      const userId = userIds[i]!;
      const taskIds = chunks[i]!;
      if (!taskIds.length) continue;

      const { data: rows, error } = await context.supabase.rpc(
        "assign_mission_tasks_to_user" as never,
        {
          _mission_id: data.mission_id,
          _user_id: userId,
          _task_ids: taskIds,
        } as never,
      );
      if (error) throw new Error(error.message);
      const assigned = ((rows as { task_ids: string[] }[] | null)?.[0]?.task_ids ?? []).length;
      totalAssigned += assigned;
      if (assigned > 0) assignedByUser.set(userId, assigned);
    }

    for (const [userId, count] of assignedByUser) {
      try {
        await sendMissionNotifications({
          missionId: data.mission_id,
          missionTitle: mission.title,
          createdBy: context.userId,
          userIds: [userId],
          body: `${count} contato(s) atribuído(s) a você.`,
          separateBatchPerUser: true,
        });
      } catch (e) {
        console.error("[missão] falha ao notificar atribuição direta", e);
      }
    }

    return { ok: true as const, assigned: totalAssigned };
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

// ===== Novas fns unificadas (leva/auto-atribuição/painel) =====

// Lista usuários com role 'agitador' — para o seletor "atribuir a pessoa específica".
export const listAgitadorUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["agitador", "admin", "operador"] as never);
    const ids = Array.from(new Set((roles ?? []).map((r) => r.user_id)));
    if (!ids.length) return { users: [] as { id: string; name: string; email: string }[] };
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name] as const));
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const emailById = new Map((data?.users ?? []).map((u) => [u.id, u.email ?? ""] as const));
    return {
      users: ids
        .map((id) => ({
          id,
          name: nameById.get(id) ?? emailById.get(id) ?? id.slice(0, 8),
          email: emailById.get(id) ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

// Briefing exibido no popup de notificação de missão.
// Mostra o que é REAL pro usuário: a leva dele (se já tem) ou o lote que ele
// vai receber (só quando a missão está aberta pra auto-atribuição).
export const getMissionNotificationBriefing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    // O agitador não tem permissão de leitura direta na missão (só staff),
    // então usamos acesso privilegiado após confirmar o usuário autenticado e
    // lemos apenas dados da própria missão + as tarefas/levas dele.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mission, error } = await supabaseAdmin
      .from("agitation_missions")
      .select("title, instructions, batch_size, cooldown_minutes, is_open, paused_at, archived_at")
      .eq("id", data.mission_id)
      .maybeSingle();
    if (error || !mission) throw new Error("Missão não encontrada");

    const { count } = await supabaseAdmin
      .from("agitation_tasks")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", data.mission_id);

    // Tarefas que já são minhas nesta missão
    const { data: myTasks } = await supabaseAdmin
      .from("agitation_tasks")
      .select("id, status, completed_at")
      .eq("mission_id", data.mission_id)
      .eq("assigned_user_id", context.userId);
    const mine = myTasks ?? [];
    const mine_total = mine.length;
    const mine_sent = mine.filter((t) => t.status === "concluido").length;
    const mine_not_sent = mine.filter((t) => t.status === "nao_enviado").length;
    const mine_pending = mine.filter((t) => !t.completed_at && t.status === "pending").length;

    const { data: openClaim } = await supabaseAdmin
      .from("agitation_mission_claims")
      .select("id")
      .eq("mission_id", data.mission_id)
      .eq("user_id", context.userId)
      .is("completed_at", null)
      .is("cancelled_at", null)
      .limit(1)
      .maybeSingle();

    const { data: lastCompleted } = await supabaseAdmin
      .from("agitation_mission_claims")
      .select("completed_at")
      .eq("mission_id", data.mission_id)
      .eq("user_id", context.userId)
      .not("completed_at", "is", null)
      .is("cancelled_at", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();


    const { count: available } = await supabaseAdmin
      .from("agitation_tasks")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", data.mission_id)
      .is("assigned_user_id", null)
      .is("assigned_contact_id", null)
      .eq("status", "pending");


    const releases_at = lastCompleted?.completed_at
      ? new Date(
          new Date(lastCompleted.completed_at).getTime() + mission.cooldown_minutes * 60_000,
        ).toISOString()
      : null;
    const in_cooldown = !!releases_at && new Date(releases_at).getTime() > Date.now();
    const has_open_claim = !!openClaim;
    const self_assign = !!mission.is_open && !mission.paused_at && !mission.archived_at;
    const can_claim = self_assign && !has_open_claim && (available ?? 0) > 0 && !in_cooldown;

    const block_reason:
      | "leva_aberta"
      | "cooldown"
      | "sem_contatos"
      | "atribuicao_direta"
      | "indisponivel"
      | null = can_claim
      ? null
      : has_open_claim
        ? "leva_aberta"
        : in_cooldown
          ? "cooldown"
          : !self_assign
            ? mission.archived_at || mission.paused_at
              ? "indisponivel"
              : "atribuicao_direta"
            : (available ?? 0) === 0
              ? "sem_contatos"
              : "indisponivel";

    return {
      title: mission.title,
      instructions: mission.instructions,
      contact_count: count ?? 0,
      batch_size: mission.batch_size,
      cooldown_minutes: mission.cooldown_minutes,
      self_assign,
      paused: !!mission.paused_at,
      archived: !!mission.archived_at,
      available_now: available ?? 0,
      mine_total,
      mine_pending,
      mine_sent,
      mine_not_sent,
      has_open_claim,
      has_my_tasks: mine_total > 0,
      releases_at,
      in_cooldown,
      can_claim,
      block_reason,
    };
  });

// Auto-atribuição: agitador aceita a missão aberta e recebe um lote atômico.
export const claimMissionBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc(
      "claim_mission_batch" as never,
      { _mission_id: data.mission_id } as never,
    );
    if (error) throw new Error(error.message);
    const row = (rows as { claim_id: string; task_ids: string[] }[] | null)?.[0];
    return { ok: true as const, claim_id: row?.claim_id ?? null, task_ids: row?.task_ids ?? [] };
  });

// Conclui a leva atual do agitador.
const claimIdSchema = z.object({ claim_id: z.string().uuid() });
export const completeMissionClaim = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => claimIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc(
      "complete_mission_claim" as never,
      { _claim_id: data.claim_id } as never,
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// Status de cooldown / disponibilidade da missão para o usuário atual.
export const getMissionCooldownStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: mission } = await context.supabase
      .from("agitation_missions")
      .select("cooldown_minutes, is_open, paused_at, batch_size")
      .eq("id", data.mission_id)
      .single();
    if (!mission) throw new Error("Missão não encontrada");

    const { data: lastCompleted } = await context.supabase
      .from("agitation_mission_claims")
      .select("completed_at")
      .eq("mission_id", data.mission_id)
      .eq("user_id", context.userId)
      .not("completed_at", "is", null)
      .is("cancelled_at", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: openClaim } = await context.supabase
      .from("agitation_mission_claims")
      .select("id")
      .eq("mission_id", data.mission_id)
      .eq("user_id", context.userId)
      .is("completed_at", null)
      .is("cancelled_at", null)
      .limit(1)
      .maybeSingle();


    const { count: available } = await context.supabase
      .from("agitation_tasks")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", data.mission_id)
      .is("assigned_user_id", null)
      .is("assigned_contact_id", null)
      .eq("status", "pending");

    const now = Date.now();
    let releasesAt: string | null = null;
    if (lastCompleted?.completed_at) {
      releasesAt = new Date(
        new Date(lastCompleted.completed_at).getTime() + mission.cooldown_minutes * 60_000,
      ).toISOString();
    }
    const hasOpenClaim = !!openClaim;
    const inCooldown = !!releasesAt && new Date(releasesAt).getTime() > now;
    const canClaim =
      !!mission.is_open &&
      !mission.paused_at &&
      !hasOpenClaim &&
      (available ?? 0) > 0 &&
      !inCooldown;

    const blockReason: "leva_aberta" | "cooldown" | "sem_contatos" | "indisponivel" | null = canClaim
      ? null
      : hasOpenClaim
        ? "leva_aberta"
        : inCooldown
          ? "cooldown"
          : (available ?? 0) === 0
            ? "sem_contatos"
            : "indisponivel";

    return {
      is_open: !!mission.is_open,
      paused: !!mission.paused_at,
      batch_size: mission.batch_size,
      cooldown_minutes: mission.cooldown_minutes,
      available_now: available ?? 0,
      releases_at: releasesAt,
      has_open_claim: hasOpenClaim,
      block_reason: blockReason,
      can_claim: canClaim,
    };
  });

// Missões do agitador atual: leva aberta OU tasks atribuídas não concluídas.
export const listMyMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: tasks } = await context.supabase
      .from("agitation_tasks")
      .select(
        "id, status, mission_id, claim_id, completed_at, contacts!agitation_tasks_contact_id_fkey(id,nome,nome_social,phone_e164,phone_raw,opt_out_at,arquivado_at)",
      )
      .eq("assigned_user_id", context.userId);

    // Também inclui missões abertas em que fui notificado, mesmo sem tasks atribuídas ainda,
    // pra permitir o primeiro "pegar lote".
    const { data: notifs } = await context.supabase
      .from("notifications")
      .select("mission_id")
      .eq("user_id", context.userId)
      .eq("kind", "mission")
      .is("cancelled_at", null)
      .not("mission_id", "is", null);

    const missionIds = Array.from(
      new Set([
        ...(tasks ?? []).map((t) => t.mission_id),
        ...((notifs ?? []).map((n) => n.mission_id).filter((v): v is string => !!v)),
      ]),
    );
    if (!missionIds.length) return { missions: [] };
    const { data: missions } = await context.supabase
      .from("agitation_missions")
      .select(
        "id, title, message_template, instructions, coordinator_phone, whatsapp_message_template, cooldown_minutes, batch_size, is_open, paused_at, archived_at, media_path, media_mime, media_filename",
      )
      .in("id", missionIds);
    const missionIdsWithTasks = new Set((tasks ?? []).map((t) => t.mission_id));
    const missionsFiltered = (missions ?? []).filter(
      (m) =>
        missionIdsWithTasks.has(m.id) ||
        (m.is_open && !m.paused_at && !m.archived_at),
    );
    const { data: claims } = await context.supabase
      .from("agitation_mission_claims")
      .select("id, mission_id, completed_at, cancelled_at, claimed_at")
      .eq("user_id", context.userId)
      .in("mission_id", missionsFiltered.map((m) => m.id));


    const claimsByMission = new Map<
      string,
      { id: string; completed_at: string | null; cancelled_at: string | null; claimed_at: string }[]
    >();
    (claims ?? []).forEach((c) => {
      const arr = claimsByMission.get(c.mission_id) ?? [];
      arr.push(c);
      claimsByMission.set(c.mission_id, arr);
    });

    const tasksByMission = new Map<string, typeof tasks>();
    (tasks ?? []).forEach((t) => {
      const arr = tasksByMission.get(t.mission_id) ?? [];
      arr!.push(t);
      tasksByMission.set(t.mission_id, arr);
    });

    return {
      missions: missionsFiltered.map((m) => {
        const mTasks = tasksByMission.get(m.id) ?? [];
        const mClaims = claimsByMission.get(m.id) ?? [];
        const openClaim = mClaims.find((c) => !c.completed_at && !c.cancelled_at) ?? null;
        // Leva liberada pela organização: sinaliza pro agitador em vez de sumir sem explicação.
        const releasedClaim = openClaim
          ? null
          : (mClaims
              .filter((c) => !!c.cancelled_at && !c.completed_at)
              .sort((a, b) => (a.cancelled_at! > b.cancelled_at! ? -1 : 1))[0] ?? null);
        return {
          mission: m,
          claim: openClaim,
          released_claim_at: releasedClaim?.cancelled_at ?? null,
          tasks: mTasks,
          pending: mTasks!.filter((t) => !t.completed_at && t.status === "pending").length,
          concluded: mTasks!.filter((t) => t.status === "concluido" || !!t.completed_at).length,
        };
      }),

    };
  });

// Painel admin: destinatários das notificações de uma missão + status de leva.
export const getMissionRecipientsPanel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => missionIdSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: notifs } = await context.supabase
      .from("notifications")
      .select("id, user_id, created_at, read_at, cancelled_at, title")
      .eq("mission_id", data.mission_id)
      .order("created_at", { ascending: false });
    const userIds = Array.from(new Set((notifs ?? []).map((n) => n.user_id)));
    if (!userIds.length) return { recipients: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    const nameById = new Map((profs ?? []).map((p) => [p.id, p.full_name] as const));

    const { data: claims } = await context.supabase
      .from("agitation_mission_claims")
      .select("id, user_id, task_count, completed_at, cancelled_at, claimed_at")
      .eq("mission_id", data.mission_id)
      .in("user_id", userIds)
      .order("claimed_at", { ascending: true });
    const claimsByUser = new Map<string, typeof claims>();
    (claims ?? []).forEach((c) => {
      const arr = claimsByUser.get(c.user_id) ?? [];
      arr.push(c);
      claimsByUser.set(c.user_id, arr);
    });
    const latestClaimByUser = new Map<
      string,
      {
        task_count: number;
        completed_at: string | null;
        cancelled_at: string | null;
        claimed_at: string;
      }
    >();
    (claims ?? []).forEach((c) => {
      const cur = latestClaimByUser.get(c.user_id);
      if (!cur || (!c.completed_at && cur.completed_at) || c.claimed_at > cur.claimed_at) {
        latestClaimByUser.set(c.user_id, {
          task_count: c.task_count,
          completed_at: c.completed_at,
          cancelled_at: c.cancelled_at,
          claimed_at: c.claimed_at,
        });
      }
    });

    // Envios reais (não "leva fechada"): fonte da verdade para o painel do admin.
    const { data: userTasks } = await context.supabase
      .from("agitation_tasks")
      .select("assigned_user_id, status, completed_at")
      .eq("mission_id", data.mission_id)
      .in("assigned_user_id", userIds);
    const statsByUser = new Map<string, { assigned: number; sent: number; pending: number }>();
    (userTasks ?? []).forEach((t) => {
      if (!t.assigned_user_id) return;
      const s = statsByUser.get(t.assigned_user_id) ?? { assigned: 0, sent: 0, pending: 0 };
      s.assigned += 1;
      if (t.status === "concluido") s.sent += 1;
      else if (t.status === "pending" && !t.completed_at) s.pending += 1;
      statsByUser.set(t.assigned_user_id, s);
    });

    return {
      recipients: (notifs ?? []).map((n) => ({
        notif_id: n.id,
        user_id: n.user_id,
        name: nameById.get(n.user_id) ?? n.user_id.slice(0, 8),
        notified_at: n.created_at,
        read_at: n.read_at,
        cancelled_at: n.cancelled_at,
        claim: latestClaimByUser.get(n.user_id) ?? null,
        claims: claimsByUser.get(n.user_id) ?? [],
        stats: statsByUser.get(n.user_id) ?? { assigned: 0, sent: 0, pending: 0 },
      })),
    };

  });

// Marca uma task da MINHA leva como concluída ou não-enviada.
const markTaskSchema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(["concluido", "nao_enviado", "erro_numero", "pending"]),
});
export const markMyMissionTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => markTaskSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("agitation_tasks")
      .update({
        status: data.status,
        completed_at: data.status === "concluido" ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.task_id)
      .eq("assigned_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

// ===== "Não quer receber": arquiva + registra opt-out do contato da minha leva =====
// Valida a posse da tarefa (assigned_user_id) e só então usa o cliente privilegiado,
// porque a política de acesso só deixa o agitador editar contatos que ele captou.
const refuseSchema = z.object({ task_id: z.string().uuid() });

async function loadOwnedTask(
  supabase: SupabaseClient<Database>,
  userId: string,
  taskId: string,
) {
  const { data, error } = await supabase
    .from("agitation_tasks")
    .select("id, contact_id, mission_id, assigned_user_id, agitation_missions(title)")
    .eq("id", taskId)
    .eq("assigned_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.contact_id) throw new Error("Contato desta missão não está na sua leva.");
  return data;
}

export const refuseMissionContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refuseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const task = await loadOwnedTask(context.supabase, context.userId, data.task_id);
    const missionTitle =
      (task as { agitation_missions?: { title?: string } | null }).agitation_missions?.title ??
      "missão de agitação";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("contacts")
      .update({
        opt_out_at: now,
        opt_out_motivo: `Pediu para não receber mensagens (missão: ${missionTitle})`,
        arquivado_at: now,
        whatsapp_status: "opt_out",
        lifecycle_status: "nao_enviar",
        consentimento_whatsapp: false,
      })
      .eq("id", task.contact_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("agitation_tasks")
      .update({ status: "nao_enviado", completed_at: null })
      .eq("id", task.id);

    await supabaseAdmin.from("contact_audit_log").insert({
      contact_id: task.contact_id,
      user_id: context.userId,
      action: "opt_out_missao",
      changes: { mission_id: task.mission_id, mission_title: missionTitle },
    });
    await supabaseAdmin.from("agitacao_contact_logs").insert({
      contact_id: task.contact_id,
      user_id: context.userId,
      action: "observacao",
      note: `Não quer receber mensagens — arquivado durante a missão "${missionTitle}".`,
      metadata: { mission_id: task.mission_id, kind: "opt_out" },
    });

    return { ok: true as const };
  });

export const undoRefuseMissionContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refuseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const task = await loadOwnedTask(context.supabase, context.userId, data.task_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("contacts")
      .update({
        opt_out_at: null,
        opt_out_motivo: null,
        arquivado_at: null,
        whatsapp_status: "desconhecido",
        lifecycle_status: null,
      })
      .eq("id", task.contact_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("agitation_tasks")
      .update({ status: "pending", completed_at: null })
      .eq("id", task.id);

    await supabaseAdmin.from("contact_audit_log").insert({
      contact_id: task.contact_id,
      user_id: context.userId,
      action: "opt_out_missao_desfeito",
      changes: { mission_id: task.mission_id },
    });

    return { ok: true as const };
  });

// ===== "Deu erro / número não abriu": arquiva + marca telefone inválido =====
// Diferente do opt-out: a pessoa não recusou, o número é que não serve.
export const reportMissionContactError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refuseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const task = await loadOwnedTask(context.supabase, context.userId, data.task_id);
    const missionTitle =
      (task as { agitation_missions?: { title?: string } | null }).agitation_missions?.title ??
      "missão de agitação";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from("contacts")
      .update({
        arquivado_at: now,
        whatsapp_status: "invalido",
        phone_status: "invalido",
        lifecycle_status: "telefone_invalido",
      })
      .eq("id", task.contact_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("agitation_tasks")
      .update({ status: "erro_numero", completed_at: null })
      .eq("id", task.id);

    await supabaseAdmin.from("contact_audit_log").insert({
      contact_id: task.contact_id,
      user_id: context.userId,
      action: "erro_numero_missao",
      changes: { mission_id: task.mission_id, mission_title: missionTitle },
    });
    await supabaseAdmin.from("agitacao_contact_logs").insert({
      contact_id: task.contact_id,
      user_id: context.userId,
      action: "observacao",
      note: `Número não abriu o WhatsApp — arquivado durante a missão "${missionTitle}".`,
      metadata: { mission_id: task.mission_id, kind: "erro_numero" },
    });

    return { ok: true as const };
  });

export const undoMissionContactError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refuseSchema.parse(d))
  .handler(async ({ data, context }) => {
    const task = await loadOwnedTask(context.supabase, context.userId, data.task_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("contacts")
      .update({
        arquivado_at: null,
        whatsapp_status: "desconhecido",
        phone_status: null,
        lifecycle_status: null,
      })
      .eq("id", task.contact_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("agitation_tasks")
      .update({ status: "pending", completed_at: null })
      .eq("id", task.id);

    await supabaseAdmin.from("contact_audit_log").insert({
      contact_id: task.contact_id,
      user_id: context.userId,
      action: "erro_numero_missao_desfeito",
      changes: { mission_id: task.mission_id },
    });

    return { ok: true as const };
  });


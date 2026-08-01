/**
 * Liberação automática de contatos parados nas missões de agitação.
 *
 * Regra única, usada pelo job agendado e por qualquer chamada manual:
 *  - 1h parado (atribuído e sem nenhuma ação): avisa o agitador uma vez.
 *  - 2h parado: o contato volta para a fila da missão e pode ser pego por outra pessoa.
 *
 * Só mexe em tarefas SEM AÇÃO (status "sem_acao"). Quem clicou "Vou enviar depois",
 * "Enviei", "Deu erro" ou "Não quer receber" nunca é liberado por aqui.
 */
import { TASK_STATUS } from "@/lib/agitation-task-status";

type AdminClient = { from: (table: string) => any };

const HOUR_MS = 60 * 60 * 1000;

export type ReleaseStalledResult = {
  avisados: number;
  liberados: number;
  missoes: number;
};

export async function releaseStalledMissionTasks(
  admin: AdminClient,
  opts: { warnAfterHours?: number; releaseAfterHours?: number } = {},
): Promise<ReleaseStalledResult> {
  const warnAfter = opts.warnAfterHours ?? 1;
  const releaseAfter = opts.releaseAfterHours ?? 2;
  const now = Date.now();
  const warnCutoff = new Date(now - warnAfter * HOUR_MS).toISOString();
  const releaseCutoff = new Date(now - releaseAfter * HOUR_MS).toISOString();

  // Missões ativas (não arquivadas e não pausadas)
  const { data: missions, error: mErr } = await admin
    .from("agitation_missions")
    .select("id,title")
    .is("archived_at", null)
    .is("paused_at", null);
  if (mErr) throw mErr;
  const missionIds: string[] = (missions ?? []).map((m: { id: string }) => m.id);
  if (!missionIds.length) return { avisados: 0, liberados: 0, missoes: 0 };
  const titleById = new Map<string, string>(
    (missions ?? []).map((m: { id: string; title: string }) => [m.id, m.title]),
  );

  // Tarefas atribuídas a uma conta, sem ação, paradas há pelo menos "warnAfter"
  const { data: stalled, error: tErr } = await admin
    .from("agitation_tasks")
    .select("id,mission_id,assigned_user_id,assigned_to_user_at,claim_id")
    .in("mission_id", missionIds)
    .eq("status", TASK_STATUS.SEM_ACAO)
    .not("assigned_user_id", "is", null)
    .lte("assigned_to_user_at", warnCutoff);
  if (tErr) throw tErr;

  const rows = (stalled ?? []) as {
    id: string;
    mission_id: string;
    assigned_user_id: string;
    assigned_to_user_at: string | null;
    claim_id: string | null;
  }[];
  if (!rows.length) return { avisados: 0, liberados: 0, missoes: missionIds.length };

  const toRelease = rows.filter((r) => (r.assigned_to_user_at ?? "") <= releaseCutoff);
  const toWarn = rows.filter((r) => (r.assigned_to_user_at ?? "") > releaseCutoff);

  // 1) Aviso amigável — no máximo um por pessoa/missão por rodada de aviso.
  let avisados = 0;
  const warnPairs = new Map<string, { userId: string; missionId: string; count: number }>();
  for (const r of toWarn) {
    const key = `${r.assigned_user_id}:${r.mission_id}`;
    const cur = warnPairs.get(key);
    if (cur) cur.count++;
    else warnPairs.set(key, { userId: r.assigned_user_id, missionId: r.mission_id, count: 1 });
  }
  for (const { userId, missionId, count } of warnPairs.values()) {
    const since = new Date(now - releaseAfter * HOUR_MS).toISOString();
    const { data: recent } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("mission_id", missionId)
      .eq("kind", "mission")
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) continue;

    const titulo = titleById.get(missionId) ?? "missão de agitação";
    const { error } = await admin.from("notifications").insert({
      user_id: userId,
      mission_id: missionId,
      kind: "mission",
      title: "Você ainda tem contatos esperando",
      body:
        `${count} contato(s) da missão “${titulo}” estão com você e ainda não tiveram nenhuma ação. ` +
        `Se você não puder agora, em cerca de ${releaseAfter}h eles voltam para a fila e outra pessoa pode assumir.`,
      cta_label: "Abrir minhas missões",
      cta_kind: "mission",
      cta_payload: { mission_id: missionId },
    });
    if (!error) avisados++;
  }

  // 2) Liberação: devolve para a fila (sem apagar nada do contato).
  let liberados = 0;
  if (toRelease.length) {
    const ids = toRelease.map((r) => r.id);
    const { error } = await admin
      .from("agitation_tasks")
      .update({ assigned_user_id: null, claim_id: null, assigned_to_user_at: null })
      .in("id", ids);
    if (error) throw error;
    liberados = ids.length;

    // Levas que ficaram sem nenhuma tarefa em aberto são encerradas.
    const claimIds = [...new Set(toRelease.map((r) => r.claim_id).filter(Boolean))] as string[];
    for (const claimId of claimIds) {
      const { data: remaining } = await admin
        .from("agitation_tasks")
        .select("id")
        .eq("claim_id", claimId)
        .limit(1);
      if (!remaining?.length) {
        await admin
          .from("agitation_mission_claims")
          .update({ cancelled_at: new Date().toISOString() })
          .eq("id", claimId)
          .is("completed_at", null)
          .is("cancelled_at", null);
      }
    }
  }

  return { avisados, liberados, missoes: missionIds.length };
}

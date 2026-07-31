import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, Pause, Play, Pencil, X, Repeat, Tag as TagIcon, Archive, ArchiveRestore } from "lucide-react";
import {
  getMissionDetail,
  unassignMissionTask,
  pauseMission,
  resumeMission,
  pauseAssignmentLink,
  resumeAssignmentLink,
  getMissionRecipientsPanel,
  archiveMission,
  unarchiveMission,
} from "@/lib/agitation-missions.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AssignResponsibleModal } from "@/components/AssignResponsibleModal";
import { AssignMissionUsersModal } from "@/components/AssignMissionUsersModal";
import { OpenMissionModal } from "@/components/OpenMissionModal";
import { EditMissionModal } from "@/components/EditMissionModal";
import { CreateMissionModal } from "@/components/CreateMissionModal";
import { ApplyTagModal } from "@/components/ApplyTagModal";
import type { CrmFilters } from "@/lib/crm-filters";

/**
 * Filtros por intenção (o que o admin realmente quer saber):
 * - sem_responsavel: ninguém foi encarregado ainda
 * - parado: tem responsável, mas nada aconteceu (nem enviou, nem marcou nada)
 * - enviado: agitador confirmou o envio
 * - depois: agitador marcou "vou enviar depois"
 * - erro: número não abriu / inválido
 * - optout: pessoa pediu pra não receber
 */
type StatusFilter =
  | "todos"
  | "sem_responsavel"
  | "parado"
  | "enviado"
  | "depois"
  | "erro"
  | "optout";

export const Route = createFileRoute("/_authenticated/missoes-agitacao/$missionId")({
  head: () => ({ meta: [{ title: "Detalhe da Missão" }] }),
  component: MissionDetailsPanel,
});

type Task = {
  id: string;
  status: string;
  assigned_contact_id: string | null;
  assigned_user_id: string | null;
  assigned_contact_name: string | null;
  assigned_user_name: string | null;
  assigned_at: string | null;
  contact: {
    id: string;
    nome: string | null;
    phone_e164: string | null;
    phone_raw?: string | null;
    cidade: string | null;
    opt_out_at?: string | null;
    arquivado_at?: string | null;
  } | null;
};

type Assignee = { kind: "link" | "conta"; id: string; nome: string | null };

type LinkRow = {
  contact_id: string;
  nome: string | null;
  total: number;
  concluidos: number;
  nao_enviados: number;
  pendentes: number;
  link: string;
  paused: boolean;
};

import { TASK_STATUS } from "@/lib/agitation-task-status";

/** Estado real de cada contato dentro da missão, do ponto de vista do admin. */
type TaskState = "sem_responsavel" | "parado" | "enviado" | "depois" | "erro" | "optout";

function taskState(t: Task): TaskState {
  if (t.contact?.opt_out_at) return "optout";
  if (t.status === TASK_STATUS.ARQUIVADO_ERRO) return "erro";
  if (t.status === TASK_STATUS.ARQUIVADO_OPTOUT) return "optout";
  if (t.status === TASK_STATUS.ENVIADO) return "enviado";
  if (t.status === TASK_STATUS.PENDENTE_ENVIO) return "depois";
  if (t.assigned_contact_id || t.assigned_user_id) return "parado";
  return "sem_responsavel";
}

const STATE_LABEL: Record<TaskState, string> = {
  sem_responsavel: "Sem responsável",
  parado: "Atribuído e parado",
  enviado: "Enviado",
  depois: "Pendente de envio",
  erro: "Arquivado — erro de número",
  optout: "Arquivado — não quer receber",
};

const STATE_BADGE: Record<TaskState, string> = {
  sem_responsavel: "bg-muted text-muted-foreground",
  parado: "bg-sky-100 text-sky-800",
  enviado: "bg-emerald-100 text-emerald-800",
  depois: "bg-orange-500 text-white",
  erro: "bg-rose-600 text-white",
  optout: "bg-rose-600 text-white",
};


function MissionDetailsPanel() {
  const { missionId } = Route.useParams();
  const detailFn = useServerFn(getMissionDetail);
  const unassignFn = useServerFn(unassignMissionTask);
  const pauseMissionFn = useServerFn(pauseMission);
  const resumeMissionFn = useServerFn(resumeMission);
  const pauseLinkFn = useServerFn(pauseAssignmentLink);
  const resumeLinkFn = useServerFn(resumeAssignmentLink);
  const archiveFn = useServerFn(archiveMission);
  const unarchiveFn = useServerFn(unarchiveMission);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignUsersOpen, setAssignUsersOpen] = useState(false);
  const [openMissionOpen, setOpenMissionOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newMissionOpen, setNewMissionOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [responsavelFilter, setResponsavelFilter] = useState<string>("todos");
  const [hideSemNumero, setHideSemNumero] = useState(false);
  const [hideOptOutErro, setHideOptOutErro] = useState(true);


  const q = useQuery({
    queryKey: ["agitation-mission-detail", missionId],
    queryFn: () => detailFn({ data: { mission_id: missionId } }),
  });
  const recipientsFn = useServerFn(getMissionRecipientsPanel);
  const recipientsQ = useQuery({
    queryKey: ["mission-recipients", missionId],
    queryFn: () => recipientsFn({ data: { mission_id: missionId } }),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["agitation-mission-detail", missionId] });
    queryClient.invalidateQueries({ queryKey: ["agitation-missions"] });
    queryClient.invalidateQueries({ queryKey: ["mission-recipients", missionId] });
  }

  const tasks = (q.data?.tasks ?? []) as Task[];
  const links = (q.data?.links ?? []) as LinkRow[];
  const assignees = (q.data?.assignees ?? []) as Assignee[];
  const missionPaused = !!q.data?.mission.paused_at;
  const missionArchived = !!q.data?.mission.archived_at;
  const missionIsOpen = !!q.data?.mission.is_open;

  function taskHasAssignment(t: Task) {
    return !!(t.assigned_contact_id || t.assigned_user_id);
  }

  const availableForPool = tasks.filter(
    (t) => taskState(t) === "sem_responsavel" && t.status === TASK_STATUS.SEM_ACAO,
  ).length;

  const assignedTaskIds = tasks.filter((t) => taskHasAssignment(t)).map((t) => t.id);
  const hasAnyAssignment = assignedTaskIds.length > 0;
  const selectedIds = [...selected];
  const canAssign = selectedIds.length > 0 && !missionArchived;

  // Contadores por estado — alimentam os rótulos dos filtros para o admin
  // nunca escolher uma opção que não traz nada.
  const stateCounts = tasks.reduce(
    (acc, t) => {
      const s = taskState(t);
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<TaskState, number>,
  );

  /** Contatos "parados": têm responsável e nenhuma ação — são os reaproveitáveis. */
  const stalledTaskIds = tasks.filter((t) => taskState(t) === "parado").map((t) => t.id);

  const filteredTasks = tasks.filter((t) => {
    const state = taskState(t);
    if (statusFilter !== "todos" && state !== statusFilter) return false;
    if (hideOptOutErro && (state === "optout" || state === "erro")) return false;
    if (responsavelFilter === "sem_atribuicao" && taskHasAssignment(t)) return false;
    if (
      responsavelFilter !== "todos" &&
      responsavelFilter !== "sem_atribuicao" &&
      t.assigned_contact_id !== responsavelFilter &&
      t.assigned_user_id !== responsavelFilter
    )
      return false;
    if (hideSemNumero && !(t.contact?.phone_e164 || t.contact?.phone_raw)) return false;
    return true;
  });



  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) =>
      prev.size === filteredTasks.length ? new Set() : new Set(filteredTasks.map((t) => t.id)),
    );
  }
  function onAssigned() {
    setSelected(new Set());
    invalidate();
  }
  async function onUnassign(taskIds: string[]) {
    if (
      !confirm(
        `Desatribuir ${taskIds.length} contato(s)? Eles voltam pra lista de sem atribuição (e status concluído/não enviado é reiniciado).`,
      )
    )
      return;
    try {
      await unassignFn({ data: { mission_id: missionId, task_ids: taskIds } });
      setSelected(new Set());
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["mission-recipients", missionId] });
      toast.success(`${taskIds.length} contato(s) desatribuído(s).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao desatribuir.");
    }
  }

  async function onUnassignAll() {
    if (
      !confirm(
        `Desatribuir TODOS os ${assignedTaskIds.length} contato(s) atribuídos desta missão?\n\nA missão inteira será esvaziada.`,
      )
    )
      return;
    try {
      await unassignFn({ data: { mission_id: missionId, task_ids: assignedTaskIds } });
      setSelected(new Set());
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["mission-recipients", missionId] });
      toast.success("Todos os contatos foram desatribuídos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao desatribuir.");
    }
  }

  function onApplyTagDone() {
    setSelected(new Set());
    invalidate();
  }

  async function onToggleMissionPause() {
    try {
      if (missionPaused) await resumeMissionFn({ data: { mission_id: missionId } });
      else await pauseMissionFn({ data: { mission_id: missionId } });
      invalidate();
      toast.success(missionPaused ? "Missão retomada." : "Missão pausada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao pausar/retomar missão.");
    }
  }

  async function onToggleArchive() {
    try {
      if (missionArchived) await unarchiveFn({ data: { mission_id: missionId } });
      else await archiveFn({ data: { mission_id: missionId } });
      invalidate();
      toast.success(missionArchived ? "Missão desarquivada." : "Missão arquivada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao arquivar/desarquivar.");
    }
  }

  async function onToggleLinkPause(link: LinkRow) {
    try {
      if (link.paused)
        await resumeLinkFn({ data: { mission_id: missionId, contact_id: link.contact_id } });
      else await pauseLinkFn({ data: { mission_id: missionId, contact_id: link.contact_id } });
      invalidate();
      toast.success(link.paused ? "Link retomado." : "Link pausado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao pausar/retomar link.");
    }
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(`${window.location.origin}${link}`);
    toast.success("Link copiado.");
  }

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!q.data)
    return <div className="p-6 text-sm text-muted-foreground">Missão não encontrada.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <Link
        to="/missoes-agitacao"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-semibold">{q.data.mission.title}</h1>
          {missionPaused && (
            <span className="text-xs rounded-full bg-rose-100 text-rose-800 px-2 py-0.5 font-medium">
              PAUSADA
            </span>
          )}
          {missionArchived && (
            <span className="text-xs rounded-full bg-slate-200 text-slate-800 px-2 py-0.5 font-medium">
              ARQUIVADA
            </span>
          )}
          {missionIsOpen && !missionArchived && (
            <span className="text-xs rounded-full bg-violet-100 text-violet-800 px-2 py-0.5 font-medium">
              AUTO-ATRIBUIÇÃO ABERTA
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {q.data.mission.message_template}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar mensagem
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleMissionPause} disabled={missionArchived}>
            {missionPaused ? (
              <Play className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Pause className="h-3.5 w-3.5 mr-1" />
            )}
            {missionPaused ? "Retomar missão" : "Pausar missão"}
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleArchive}>
            {missionArchived ? (
              <ArchiveRestore className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Archive className="h-3.5 w-3.5 mr-1" />
            )}
            {missionArchived ? "Desarquivar" : "Arquivar missão"}
          </Button>
          {q.data.mission.source_filters && (
            <Button size="sm" variant="outline" onClick={() => setNewMissionOpen(true)}>
              <Repeat className="h-3.5 w-3.5 mr-1" /> Nova missão com o mesmo filtro
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Como distribuir esta missão</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Selecione contatos na lista abaixo e escolha uma ação — ou abra o pool para
            auto-atribuição. As ações podem ser usadas em conjunto na mesma missão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={!canAssign} onClick={() => setAssignOpen(true)}>
            Gerar link para responsável ({selected.size})
          </Button>
          <Button size="sm" variant="secondary" disabled={!canAssign} onClick={() => setAssignUsersOpen(true)}>
            Atribuir a agitador com conta ({selected.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={missionArchived || availableForPool <= 0 || missionPaused}
            onClick={() => setOpenMissionOpen(true)}
          >
            Abrir para auto-atribuição ({availableForPool} disponíveis)
          </Button>
        </div>
        {missionArchived && (
          <p className="text-xs text-muted-foreground">
            Missão arquivada: novas atribuições bloqueadas. Links já gerados continuam funcionando.
          </p>
        )}
      </div>

      {(recipientsQ.data?.recipients?.length ?? 0) > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Destinatários</h2>
          <div className="rounded-lg border bg-muted/30 p-3 mb-2 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">O que cada situação significa</p>
            <p><strong>Não lida</strong>: recebeu o aviso e nunca abriu.</p>
            <p><strong>Lida</strong>: abriu o aviso, mas não pegou contatos.</p>
            <p><strong>Em andamento</strong>: pegou contatos e ainda não avisou que terminou.</p>
            <p><strong>Concluída</strong>: avisou que terminou e tratou todos os contatos da leva.</p>
            <p><strong>Concluída parcialmente</strong>: avisou que terminou deixando contatos não enviados.</p>
            <p><strong>Fechou sem enviar</strong>: avisou que terminou sem enviar nenhuma mensagem.</p>
            <p><strong>Liberada pela organização</strong>: a leva dela foi devolvida para a fila.</p>
          </div>
          <div className="rounded-xl border divide-y">
            {(recipientsQ.data?.recipients ?? []).map((r) => {
              const isCancelled = !!r.cancelled_at;
              const claim = r.claim;
              const stats = r.stats ?? { assigned: 0, sent: 0, pending: 0 };
              const untouched = stats.pending;
              const status = isCancelled
                ? { label: "Cancelada", className: "bg-rose-100 text-rose-800" }
                : claim?.completed_at
                  ? stats.sent > 0
                    ? untouched > 0
                      ? {
                          label: `Concluída parcialmente (${stats.sent} de ${stats.assigned})`,
                          className: "bg-amber-100 text-amber-900",
                        }
                      : { label: "Concluída", className: "bg-emerald-100 text-emerald-800" }
                    : { label: "Fechou sem enviar", className: "bg-orange-100 text-orange-800" }
                  : claim?.cancelled_at
                    ? { label: "Liberada pela organização", className: "bg-slate-200 text-slate-800" }
                    : claim
                      ? { label: "Em andamento", className: "bg-amber-100 text-amber-800" }
                      : r.read_at
                        ? { label: "Lida", className: "bg-blue-100 text-blue-800" }
                        : { label: "Não lida", className: "bg-muted text-muted-foreground" };
              return (
                <div key={r.notif_id} className="flex items-center gap-3 p-3 text-sm flex-wrap">
                  <div className="flex-1 min-w-[160px]">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Notificada em {new Date(r.notified_at).toLocaleString("pt-BR")}
                      {r.read_at && ` · lida em ${new Date(r.read_at).toLocaleString("pt-BR")}`}
                      {stats.assigned > 0 &&
                        ` · enviados ${stats.sent} de ${stats.assigned}${untouched > 0 ? ` · ${untouched} não enviado(s)` : ""}`}
                      {claim?.cancelled_at &&
                        ` · leva liberada em ${new Date(claim.cancelled_at).toLocaleString("pt-BR")}`}
                    </div>
                  </div>


                  <span className={`text-xs rounded-full px-2 py-0.5 ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {links.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-2">Links atribuídos</h2>
          <div className="rounded-xl border divide-y">
            {links.map((l) => (
              <div key={l.contact_id} className="flex items-center gap-3 p-3 text-sm flex-wrap">
                <div className="flex-1 min-w-[160px]">
                  <div className="font-medium">{l.nome ?? "(sem nome)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {l.total} contato(s) · {l.concluidos} concluído(s) · {l.nao_enviados} não
                    enviado(s) · {l.pendentes} pendente(s)
                  </div>
                </div>
                {l.paused && (
                  <span className="text-xs rounded-full bg-rose-100 text-rose-800 px-2 py-0.5">
                    Link pausado
                  </span>
                )}
                <Button size="sm" variant="outline" onClick={() => copyLink(l.link)}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Copiar link
                </Button>
                <Button size="sm" variant="outline" onClick={() => onToggleLinkPause(l)}>
                  {l.paused ? (
                    <Play className="h-3.5 w-3.5 mr-1" />
                  ) : (
                    <Pause className="h-3.5 w-3.5 mr-1" />
                  )}
                  {l.paused ? "Retomar link" : "Pausar link"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-xs h-8 rounded-md border px-2 bg-background"
          >
            <option value="todos">Situação: todas ({tasks.length})</option>
            <option value="sem_responsavel">
              Sem responsável ({stateCounts.sem_responsavel ?? 0})
            </option>
            <option value="parado">
              Atribuído e parado — ainda não acionou ({stateCounts.parado ?? 0})
            </option>
            <option value="enviado">Enviado ({stateCounts.enviado ?? 0})</option>
            <option value="depois">Vou enviar depois ({stateCounts.depois ?? 0})</option>
            <option value="erro">Erro de número ({stateCounts.erro ?? 0})</option>
            <option value="optout">Não quer receber ({stateCounts.optout ?? 0})</option>
          </select>
          <select
            value={responsavelFilter}
            onChange={(e) => setResponsavelFilter(e.target.value)}
            className="text-xs h-8 rounded-md border px-2 bg-background"
          >
            <option value="todos">Responsável: todos</option>
            <option value="sem_atribuicao">Sem responsável</option>
            {assignees.map((a) => (
              <option key={`${a.kind}-${a.id}`} value={a.id}>
                {a.kind === "link" ? "Link" : "Conta"}: {a.nome ?? "(sem nome)"}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs h-8 rounded-md border px-2 bg-background cursor-pointer select-none">
            <Checkbox
              checked={hideSemNumero}
              onCheckedChange={(v) => setHideSemNumero(v === true)}
            />
            Esconder sem número
          </label>
          <label className="flex items-center gap-1.5 text-xs h-8 rounded-md border px-2 bg-background cursor-pointer select-none">
            <Checkbox
              checked={hideOptOutErro}
              onCheckedChange={(v) => setHideOptOutErro(v === true)}
            />
            Esconder quem não quer receber e erros de número
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={filteredTasks.length > 0 && selected.size === filteredTasks.length}
              onCheckedChange={toggleAllFiltered}
            />
            Selecionar todos os filtrados ({filteredTasks.length})
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={!canAssign} onClick={() => setAssignOpen(true)}>
              Gerar link ({selected.size})
            </Button>
            <Button size="sm" variant="outline" disabled={!canAssign} onClick={() => setAssignUsersOpen(true)}>
              Agitador com conta ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => onUnassign([...selected])}
            >
              Liberar selecionados ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={stalledTaskIds.length === 0}
              title="Libera só os contatos que têm responsável mas ainda não foram acionados, para você redistribuir."
              onClick={() => onUnassign(stalledTaskIds)}
            >
              Liberar parados ({stalledTaskIds.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasAnyAssignment}
              onClick={onUnassignAll}
            >
              Liberar todos
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => setTagOpen(true)}
            >
              <TagIcon className="h-3.5 w-3.5 mr-1" /> Aplicar tag ({selected.size})
            </Button>
          </div>
        </div>

        <div className="rounded-xl border divide-y">
          {filteredTasks.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">
              Nenhum contato nesta situação. Troque os filtros acima.
            </div>
          )}
          {filteredTasks.map((t) => {
            const state = taskState(t);
            return (
              <div key={t.id} className="flex items-center gap-3 p-3 text-sm">
                <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
                <div className="flex-1">
                  <div className="font-medium">{t.contact?.nome ?? "(sem nome)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.contact?.phone_e164 ?? t.contact?.phone_raw ?? "—"} ·{" "}
                    {t.contact?.cidade ?? "—"}
                  </div>
                </div>
                <span className={`text-xs rounded-full px-2 py-0.5 ${STATE_BADGE[state]}`}>
                  {STATE_LABEL[state]}
                  {t.assigned_contact_name
                    ? ` · Link: ${t.assigned_contact_name}`
                    : t.assigned_user_name
                      ? ` · Conta: ${t.assigned_user_name}`
                      : ""}
                </span>
                {taskHasAssignment(t) && (
                  <button
                    type="button"
                    title="Liberar atribuição"
                    onClick={() => onUnassign([t.id])}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>


      <AssignResponsibleModal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        missionId={missionId}
        taskIds={selectedIds}
        onAssigned={onAssigned}
      />

      <AssignMissionUsersModal
        open={assignUsersOpen}
        onOpenChange={setAssignUsersOpen}
        missionId={missionId}
        taskIds={selectedIds}
        onAssigned={onAssigned}
      />

      <OpenMissionModal
        open={openMissionOpen}
        onOpenChange={setOpenMissionOpen}
        missionId={missionId}
        availableCount={availableForPool}
        defaultBatchSize={q.data.mission.batch_size ?? 10}
        defaultCooldown={q.data.mission.cooldown_minutes ?? 60}
        onOpened={onAssigned}
      />

      <EditMissionModal
        open={editOpen}
        onOpenChange={setEditOpen}
        missionId={missionId}
        initialTitle={q.data.mission.title}
        initialMessage={q.data.mission.message_template}
        initialInstructions={q.data.mission.instructions ?? null}
        initialMedia={{
          media_path: q.data.mission.media_path ?? null,
          media_mime: q.data.mission.media_mime ?? null,
          media_filename: q.data.mission.media_filename ?? null,
        }}
        initialBatchSize={q.data.mission.batch_size ?? 10}
        initialCooldown={q.data.mission.cooldown_minutes ?? 60}
        onUpdated={invalidate}
      />

      {q.data.mission.source_filters && (
        <CreateMissionModal
          open={newMissionOpen}
          onOpenChange={setNewMissionOpen}
          source={{ filters: q.data.mission.source_filters as CrmFilters }}
          labelSelecao="todos os contatos do filtro original desta missão"
        />
      )}

      <ApplyTagModal
        open={tagOpen}
        onOpenChange={setTagOpen}
        contactIds={tasks
          .filter((t) => selected.has(t.id) && t.contact?.id)
          .map((t) => t.contact!.id)}
        defaultTagName={q.data.mission.title}
        onApplied={onApplyTagDone}
      />
    </div>
  );
}

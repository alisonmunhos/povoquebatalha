import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Copy, Pause, Play, Pencil, X, Repeat, Tag as TagIcon } from "lucide-react";
import {
  getMissionDetail,
  unassignMissionTask,
  pauseMission,
  resumeMission,
  pauseAssignmentLink,
  resumeAssignmentLink,
} from "@/lib/agitation-missions.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AssignResponsibleModal } from "@/components/AssignResponsibleModal";
import { EditMissionModal } from "@/components/EditMissionModal";
import { CreateMissionModal } from "@/components/CreateMissionModal";
import { ApplyTagModal } from "@/components/ApplyTagModal";
import type { CrmFilters } from "@/lib/crm-filters";

type StatusFilter = "todos" | "sem_atribuicao" | "atribuido" | "concluido" | "nao_enviado";

export const Route = createFileRoute("/_authenticated/missoes-agitacao/$missionId")({
  head: () => ({ meta: [{ title: "Detalhe da Missão" }] }),
  component: MissionDetailsPanel,
});

type Task = {
  id: string;
  status: string;
  assigned_contact_id: string | null;
  assigned_contact_name: string | null;
  assigned_at: string | null;
  contact: {
    id: string;
    nome: string | null;
    phone_e164: string | null;
    cidade: string | null;
  } | null;
};

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

const STATUS_BADGE: Record<string, string> = {
  concluido: "bg-emerald-100 text-emerald-800",
  nao_enviado: "bg-rose-100 text-rose-800",
};
const STATUS_LABEL: Record<string, string> = {
  concluido: "Concluído",
  nao_enviado: "Não enviado",
};

function MissionDetailsPanel() {
  const { missionId } = Route.useParams();
  const detailFn = useServerFn(getMissionDetail);
  const unassignFn = useServerFn(unassignMissionTask);
  const pauseMissionFn = useServerFn(pauseMission);
  const resumeMissionFn = useServerFn(resumeMission);
  const pauseLinkFn = useServerFn(pauseAssignmentLink);
  const resumeLinkFn = useServerFn(resumeAssignmentLink);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [newMissionOpen, setNewMissionOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [responsavelFilter, setResponsavelFilter] = useState<string>("todos");

  const q = useQuery({
    queryKey: ["agitation-mission-detail", missionId],
    queryFn: () => detailFn({ data: { mission_id: missionId } }),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["agitation-mission-detail", missionId] });
    queryClient.invalidateQueries({ queryKey: ["agitation-missions"] });
  }

  const tasks = (q.data?.tasks ?? []) as Task[];
  const links = (q.data?.links ?? []) as LinkRow[];
  const missionPaused = !!q.data?.mission.paused_at;

  const filteredTasks = tasks.filter((t) => {
    if (statusFilter === "sem_atribuicao" && t.assigned_contact_id) return false;
    if (statusFilter === "atribuido" && !(t.assigned_contact_id && t.status === "pending"))
      return false;
    if (statusFilter === "concluido" && t.status !== "concluido") return false;
    if (statusFilter === "nao_enviado" && t.status !== "nao_enviado") return false;
    if (responsavelFilter === "sem_atribuicao" && t.assigned_contact_id) return false;
    if (
      responsavelFilter !== "todos" &&
      responsavelFilter !== "sem_atribuicao" &&
      t.assigned_contact_id !== responsavelFilter
    )
      return false;
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
      await unassignFn({ data: { task_ids: taskIds } });
      setSelected(new Set());
      invalidate();
      toast.success(`${taskIds.length} contato(s) desatribuído(s).`);
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
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {q.data.mission.message_template}
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar mensagem
          </Button>
          <Button size="sm" variant="outline" onClick={onToggleMissionPause}>
            {missionPaused ? (
              <Play className="h-3.5 w-3.5 mr-1" />
            ) : (
              <Pause className="h-3.5 w-3.5 mr-1" />
            )}
            {missionPaused ? "Retomar missão" : "Pausar missão"}
          </Button>
          {q.data.mission.source_filters && (
            <Button size="sm" variant="outline" onClick={() => setNewMissionOpen(true)}>
              <Repeat className="h-3.5 w-3.5 mr-1" /> Nova missão com o mesmo filtro
            </Button>
          )}
        </div>
      </div>

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
            <option value="todos">Status: todos</option>
            <option value="sem_atribuicao">Sem atribuição</option>
            <option value="atribuido">Atribuído (pendente)</option>
            <option value="concluido">Concluído</option>
            <option value="nao_enviado">Não enviado</option>
          </select>
          <select
            value={responsavelFilter}
            onChange={(e) => setResponsavelFilter(e.target.value)}
            className="text-xs h-8 rounded-md border px-2 bg-background"
          >
            <option value="todos">Responsável: todos</option>
            <option value="sem_atribuicao">Sem atribuição</option>
            {links.map((l) => (
              <option key={l.contact_id} value={l.contact_id}>
                {l.nome ?? "(sem nome)"}
              </option>
            ))}
          </select>
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
            <Button size="sm" disabled={selected.size === 0} onClick={() => setAssignOpen(true)}>
              Atribuir Responsável ({selected.size})
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={selected.size === 0}
              onClick={() => onUnassign([...selected])}
            >
              Desatribuir selecionados ({selected.size})
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
          {filteredTasks.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-3 text-sm">
              <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggle(t.id)} />
              <div className="flex-1">
                <div className="font-medium">{t.contact?.nome ?? "(sem nome)"}</div>
                <div className="text-xs text-muted-foreground">
                  {t.contact?.phone_e164 ?? "—"} · {t.contact?.cidade ?? "—"}
                </div>
              </div>
              {t.assigned_contact_id ? (
                <>
                  <span
                    className={`text-xs rounded-full px-2 py-0.5 ${STATUS_BADGE[t.status] ?? "bg-muted text-muted-foreground"}`}
                  >
                    {STATUS_LABEL[t.status] ?? "Atribuído"} · {t.assigned_contact_name ?? "—"}
                  </span>
                  <button
                    type="button"
                    title="Desatribuir"
                    onClick={() => onUnassign([t.id])}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <span className="text-xs rounded-full bg-muted px-2 py-0.5">Sem atribuição</span>
              )}
            </div>
          ))}
        </div>
      </div>

      <AssignResponsibleModal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        missionId={missionId}
        taskIds={[...selected]}
        onAssigned={onAssigned}
      />

      <EditMissionModal
        open={editOpen}
        onOpenChange={setEditOpen}
        missionId={missionId}
        initialTitle={q.data.mission.title}
        initialMessage={q.data.mission.message_template}
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

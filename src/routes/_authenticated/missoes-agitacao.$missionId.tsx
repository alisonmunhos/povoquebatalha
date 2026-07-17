import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { getMissionDetail } from "@/lib/agitation-missions.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AssignResponsibleModal } from "@/components/AssignResponsibleModal";

export const Route = createFileRoute("/_authenticated/missoes-agitacao/$missionId")({
  head: () => ({ meta: [{ title: "Detalhe da Missão" }] }),
  component: MissionDetailsPanel,
});

type Task = {
  id: string;
  status: string;
  assigned_contact_id: string | null;
  assigned_contact_name: string | null;
  contact: {
    id: string;
    nome: string | null;
    phone_e164: string | null;
    cidade: string | null;
  } | null;
};

function MissionDetailsPanel() {
  const { missionId } = Route.useParams();
  const detailFn = useServerFn(getMissionDetail);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);

  const q = useQuery({
    queryKey: ["agitation-mission-detail", missionId],
    queryFn: () => detailFn({ data: { mission_id: missionId } }),
  });

  const tasks = (q.data?.tasks ?? []) as Task[];
  const pendentes = tasks.filter((t) => !t.assigned_contact_id);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPendentes() {
    setSelected((prev) =>
      prev.size === pendentes.length ? new Set() : new Set(pendentes.map((t) => t.id)),
    );
  }

  function onAssigned() {
    setSelected(new Set());
    queryClient.invalidateQueries({ queryKey: ["agitation-mission-detail", missionId] });
    queryClient.invalidateQueries({ queryKey: ["agitation-missions"] });
  }

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!q.data)
    return <div className="p-6 text-sm text-muted-foreground">Missão não encontrada.</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <Link
        to="/missoes-agitacao"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div>
        <h1 className="text-xl font-semibold">{q.data.mission.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
          {q.data.mission.message_template}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={pendentes.length > 0 && selected.size === pendentes.length}
            onCheckedChange={toggleAllPendentes}
          />
          Selecionar todos sem atribuição ({pendentes.length})
        </label>
        <Button size="sm" disabled={selected.size === 0} onClick={() => setAssignOpen(true)}>
          Atribuir Responsável ({selected.size})
        </Button>
      </div>

      <div className="rounded-xl border divide-y">
        {tasks.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-3 text-sm">
            <Checkbox
              checked={selected.has(t.id)}
              disabled={!!t.assigned_contact_id}
              onCheckedChange={() => toggle(t.id)}
            />
            <div className="flex-1">
              <div className="font-medium">{t.contact?.nome ?? "(sem nome)"}</div>
              <div className="text-xs text-muted-foreground">
                {t.contact?.phone_e164 ?? "—"} · {t.contact?.cidade ?? "—"}
              </div>
            </div>
            {t.assigned_contact_id ? (
              <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5">
                {t.status === "concluido" ? "Concluído" : "Atribuído"} ·{" "}
                {t.assigned_contact_name ?? "—"}
              </span>
            ) : (
              <span className="text-xs rounded-full bg-muted px-2 py-0.5">Sem atribuição</span>
            )}
          </div>
        ))}
      </div>

      <AssignResponsibleModal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        missionId={missionId}
        taskIds={[...selected]}
        onAssigned={onAssigned}
      />
    </div>
  );
}

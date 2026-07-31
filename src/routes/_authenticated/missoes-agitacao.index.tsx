import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Megaphone } from "lucide-react";
import { listAgitationMissions } from "@/lib/agitation-missions.functions";

export const Route = createFileRoute("/_authenticated/missoes-agitacao/")({
  head: () => ({ meta: [{ title: "Missões de Agitação" }] }),
  component: MissoesAgitacaoIndex,
});

type VisibilityFilter = "all" | "active" | "archived";

type MissionRow = {
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

function MissoesAgitacaoIndex() {
  const listFn = useServerFn(listAgitationMissions);
  const [visibility, setVisibility] = useState<VisibilityFilter>("active");
  const q = useQuery({
    queryKey: ["agitation-missions", visibility],
    queryFn: () => listFn({ data: { visibility } }),
  });
  const missions = (q.data?.missions ?? []) as MissionRow[];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Missões de Agitação</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/missoes-agitacao/desempenho"
            className="text-sm h-9 inline-flex items-center rounded-md border px-3 hover:bg-muted/60"
          >
            Ver desempenho
          </Link>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as VisibilityFilter)}
            className="text-sm h-9 rounded-md border px-3 bg-background"
          >
            <option value="active">Mostrar: Ativas</option>
            <option value="archived">Mostrar: Arquivadas</option>
            <option value="all">Mostrar: Todas</option>
          </select>
        </div>

      <p className="text-sm text-muted-foreground">
        Crie uma missão selecionando contatos na Gestão da Base (&quot;Criar Missão&quot;). Na tela
        de detalhe, distribua por link público, por agitador com conta ou por auto-atribuição.
      </p>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!q.isLoading && missions.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma missão neste filtro.</p>
      )}

      <div className="space-y-2">
        {missions.map((m) => (
          <Link
            key={m.id}
            to="/missoes-agitacao/$missionId"
            params={{ missionId: m.id }}
            className="block rounded-lg border p-4 hover:bg-muted/40 transition"
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">{m.title}</span>
                {m.archived_at && (
                  <span className="text-[10px] rounded-full bg-slate-200 text-slate-800 px-2 py-0.5">
                    Arquivada
                  </span>
                )}
                {m.paused_at && !m.archived_at && (
                  <span className="text-[10px] rounded-full bg-rose-100 text-rose-800 px-2 py-0.5">
                    Pausada
                  </span>
                )}
                {m.is_open && !m.archived_at && (
                  <span className="text-[10px] rounded-full bg-violet-100 text-violet-800 px-2 py-0.5">
                    Auto-atribuição
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(m.created_at).toLocaleDateString("pt-BR")}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{m.total} contato(s)</span>
              <span>{m.atribuidos} atribuído(s)</span>
              <span>{m.pendentes} sem atribuição</span>
              <span>{m.concluidos} concluído(s)</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

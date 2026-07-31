import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { BarChart3, ArrowLeft } from "lucide-react";
import { getMissionsPerformance } from "@/lib/agitation-performance.functions";
import { PerformanceSummary } from "@/components/mission-performance/PerformanceSummary";
import { AssigneeRanking } from "@/components/mission-performance/AssigneeRanking";
import { MissionBreakdown } from "@/components/mission-performance/MissionBreakdown";

export const Route = createFileRoute("/_authenticated/missoes-agitacao/desempenho")({
  head: () => ({
    meta: [
      { title: "Desempenho das Missões de Agitação" },
      {
        name: "description",
        content: "Acompanhe envios, taxa de conclusão e ranking de agitadores das missões.",
      },
    ],
  }),
  component: DesempenhoMissoes,
});

type Visibility = "all" | "active" | "archived";
type Days = 7 | 30 | 90 | 0;

function DesempenhoMissoes() {
  const fetchFn = useServerFn(getMissionsPerformance);
  const [visibility, setVisibility] = useState<Visibility>("active");
  const [days, setDays] = useState<Days>(30);

  const q = useQuery({
    queryKey: ["missions-performance", visibility, days],
    queryFn: () => fetchFn({ data: { visibility, days } }),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Desempenho das Missões</h1>
        </div>
        <Link
          to="/missoes-agitacao"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar para as missões
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">
        Tela de acompanhamento. Nada aqui altera missões, contatos ou tarefas.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value) as Days)}
          className="text-sm h-9 rounded-md border px-3 bg-background"
        >
          <option value={7}>Período: últimos 7 dias</option>
          <option value={30}>Período: últimos 30 dias</option>
          <option value={90}>Período: últimos 90 dias</option>
          <option value={0}>Período: tudo</option>
        </select>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          className="text-sm h-9 rounded-md border px-3 bg-background"
        >
          <option value="active">Mostrar: missões ativas</option>
          <option value="archived">Mostrar: missões arquivadas</option>
          <option value="all">Mostrar: todas</option>
        </select>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {q.isError && (
        <p className="text-sm text-rose-600">
          Não foi possível carregar o desempenho agora. Tente novamente em instantes.
        </p>
      )}

      {q.data && (
        <>
          <PerformanceSummary totals={q.data.geral} />
          <AssigneeRanking rows={q.data.assignees} />
          <MissionBreakdown rows={q.data.missions} />
        </>
      )}
    </div>
  );
}

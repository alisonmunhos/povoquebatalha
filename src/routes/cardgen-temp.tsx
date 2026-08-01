// TEMPORÁRIO: rota usada só para gerar imagens dos cartões de jornada.
// Pode ser apagada depois da geração.
import { createFileRoute } from "@tanstack/react-router";
import { ImpactShareCard } from "@/components/ImpactShareCard";
import type { ImpactStats } from "@/lib/impact-stats-types";

export const Route = createFileRoute("/cardgen-temp")({
  validateSearch: (s: Record<string, unknown>) => ({ d: typeof s["d"] === "string" ? (s["d"] as string) : "" }),
  component: CardGen,
});

function CardGen() {
  const { d } = Route.useSearch();
  if (!d) return <p>sem dados</p>;
  const stats = JSON.parse(decodeURIComponent(escape(atob(d)))) as ImpactStats;
  return (
    <div id="card-wrap" style={{ width: 1080 }}>
      <ImpactShareCard stats={stats} variant="week" week={stats.weeks.closed} />
    </div>
  );
}

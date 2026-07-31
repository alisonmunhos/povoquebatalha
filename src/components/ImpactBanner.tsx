// Faixa resumida de impacto — sempre à vista, clicável, leva para /meu-impacto.
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Flame } from "lucide-react";
import { getMyImpactStats } from "@/lib/impact-stats.functions";

export function ImpactBanner({ className = "" }: { className?: string }) {
  const statsFn = useServerFn(getMyImpactStats);
  const q = useQuery({
    queryKey: ["my-impact"],
    queryFn: () => statsFn(),
    staleTime: 60_000,
    retry: 1,
  });

  if (q.isError) return null;
  const total = q.data?.connections.total ?? 0;
  const today = q.data?.connections.today ?? 0;

  return (
    <Link
      to="/meu-impacto"
      className={`flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5 transition hover:bg-primary/15 ${className}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/20">
        <Flame className="h-4.5 w-4.5 text-primary" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">
          {q.isLoading ? "Carregando seu impacto…" : `Você já se conectou com ${total} pessoas`}
        </span>
        <span className="block text-xs text-muted-foreground">
          {today > 0 ? `${today} hoje · toque para ver seus números` : "Toque para ver seus números"}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

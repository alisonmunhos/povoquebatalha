// Desempenho por missão — somente leitura, com link para o detalhe já existente.
import { Link } from "@tanstack/react-router";
import type { MissionPerformance } from "@/lib/agitation-performance.functions";
import { conclusionRate } from "./PerformanceSummary";

export function MissionBreakdown({ rows }: { rows: MissionPerformance[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma missão neste período.</p>;
  }
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">Por missão</h2>
      <div className="space-y-2">
        {rows.map((m) => {
          const rate = conclusionRate(m);
          return (
            <Link
              key={m.id}
              to="/missoes-agitacao/$missionId"
              params={{ missionId: m.id }}
              className="block rounded-lg border p-4 hover:bg-muted/40 transition"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
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

              <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${rate}%` }} />
              </div>

              <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>{rate}% concluído</span>
                <span>{m.total} contato(s)</span>
                <span>{m.enviados} enviado(s)</span>
                <span>{m.pendentes} vou enviar depois</span>
                <span>{m.nao_enviados} não enviado(s)</span>
                <span>{m.arquivados} arquivado(s)</span>
                <span>{m.responsaveis} responsável(is)</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

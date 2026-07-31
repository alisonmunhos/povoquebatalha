// Cards de resumo do painel de desempenho das missões.
import type { PerformanceTotals } from "@/lib/agitation-performance.functions";

export function conclusionRate(t: PerformanceTotals): number {
  const base = t.total - t.arquivados;
  if (base <= 0) return 0;
  return Math.round((t.enviados / base) * 100);
}

export function PerformanceSummary({ totals }: { totals: PerformanceTotals }) {
  const cards = [
    { label: "Contatos em missões", value: totals.total, hint: "Total de contatos incluídos nas missões do período." },
    { label: "Enviados", value: totals.enviados, hint: "Agitador confirmou o envio." },
    { label: "Vou enviar depois", value: totals.pendentes, hint: "Ficou marcado para enviar mais tarde." },
    { label: "Não enviados", value: totals.nao_enviados, hint: "Ninguém agiu nesse contato ainda." },
    { label: "Arquivados", value: totals.arquivados, hint: "Número com erro ou pessoa não quer receber." },
    {
      label: "Taxa de conclusão",
      value: `${conclusionRate(totals)}%`,
      hint: "Enviados dividido pelos contatos que ainda valem envio (sem os arquivados).",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border p-3 bg-card" title={c.hint}>
          <p className="text-xs text-muted-foreground">{c.label}</p>
          <p className="text-2xl font-semibold">{c.value}</p>
        </div>
      ))}
    </div>
  );
}

// Ranking de agitadores — somente leitura.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AssigneePerformance } from "@/lib/agitation-performance.functions";
import { conclusionRate } from "./PerformanceSummary";

type SortKey = "enviados" | "conclusao";

export function AssigneeRanking({ rows }: { rows: AssigneePerformance[] }) {
  const [sort, setSort] = useState<SortKey>("enviados");

  const sorted = [...rows].sort((a, b) =>
    sort === "enviados"
      ? b.enviados - a.enviados || b.total - a.total
      : conclusionRate(b) - conclusionRate(a) || b.enviados - a.enviados,
  );


  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Ranking de agitadores</h2>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="text-sm h-9 rounded-md border px-3 bg-background"
        >
          <option value="enviados">Ordenar por: enviados</option>
          <option value="conclusao">Ordenar por: taxa de conclusão</option>
        </select>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Ninguém com contatos atribuídos neste período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Responsável</th>
                <th className="text-right p-2" title="Contatos atribuídos a essa pessoa.">Atribuídos</th>
                <th className="text-right p-2" title="Confirmou o envio.">Enviados</th>
                <th className="text-right p-2" title="Marcou para enviar depois.">Depois</th>
                <th className="text-right p-2" title="Ainda não agiu.">Não enviados</th>
                <th className="text-right p-2" title="Número com erro ou não quer receber.">Arquivados</th>
                <th className="text-right p-2" title="Enviados sobre os contatos que ainda valem envio.">Conclusão</th>
                <th className="text-right p-2">Última ação</th>
                <th className="text-right p-2">Jornada</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.key} className="border-t">
                  <td className="p-2">
                    <span className="font-medium">{r.nome}</span>
                    <span className="ml-2 text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                      {r.tipo === "conta" ? "com conta" : "link"}
                    </span>
                  </td>
                  <td className="p-2 text-right">{r.atribuidos}</td>
                  <td className="p-2 text-right font-medium text-emerald-700">{r.enviados}</td>
                  <td className="p-2 text-right">{r.pendentes}</td>
                  <td className="p-2 text-right">{r.nao_enviados}</td>
                  <td className="p-2 text-right">{r.arquivados}</td>
                  <td className="p-2 text-right">{conclusionRate(r)}%</td>
                  <td className="p-2 text-right text-xs text-muted-foreground">
                    {r.ultima_acao ? new Date(r.ultima_acao).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="p-2 text-right">
                    {r.userId ? (
                      <span className="flex justify-end gap-2">
                        <Link
                          to="/meu-impacto"
                          search={{ userId: r.userId }}
                          target="_blank"
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                          title="Abre a mesma tela que essa pessoa vê no app."
                        >
                          Geral
                        </Link>
                        <Link
                          to="/minha-semana"
                          search={{ userId: r.userId }}
                          target="_blank"
                          className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                          title="Abre a tela da semana dessa pessoa."
                        >
                          Semana
                        </Link>
                      </span>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground"
                        title="Essa pessoa não tem cadastro no app, então não existe jornada para abrir."
                      >
                        —
                      </span>
                    )}

                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </section>
  );
}


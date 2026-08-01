// Ranking de agitadores — somente leitura.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import type { AssigneePerformance } from "@/lib/agitation-performance.functions";
import { conclusionRate } from "./PerformanceSummary";
import { SendJourneyDialog } from "./SendJourneyDialog";

type SortKey = "conexoes" | "enviados" | "cadastros" | "conclusao";

/** Mensagem pronta para mandar a jornada da pessoa pelo WhatsApp. */
function journeyMessage(r: AssigneePerformance): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const primeiro = r.nome.split(" ")[0] ?? r.nome;
  return [
    `Olá, ${primeiro}! Olha o tamanho da sua jornada no Povo que Batalha:`,
    `• ${r.conexoes} ${r.conexoes === 1 ? "conexão" : "conexões"}`,
    `• ${r.enviados} ${r.enviados === 1 ? "mensagem enviada" : "mensagens enviadas"}`,
    `• ${r.cadastros} ${r.cadastros === 1 ? "cadastro" : "cadastros"}`,
    "",
    `Veja e compartilhe a sua: ${origin}/meu-impacto`,
  ].join("\n");
}

export function AssigneeRanking({ rows }: { rows: AssigneePerformance[] }) {
  const [sort, setSort] = useState<SortKey>("conexoes");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [sending, setSending] = useState<AssigneePerformance | null>(null);

  const visible = hideEmpty ? rows.filter((r) => r.conexoes > 0 || r.atribuidos > 0) : rows;
  const sorted = [...visible].sort((a, b) => {
    if (sort === "conexoes") return b.conexoes - a.conexoes || b.enviados - a.enviados;
    if (sort === "cadastros") return b.cadastros - a.cadastros || b.conexoes - a.conexoes;
    if (sort === "enviados") return b.enviados - a.enviados || b.total - a.total;
    return conclusionRate(b) - conclusionRate(a) || b.enviados - a.enviados;
  });



  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Jornada de todos os usuários</h2>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Esconder quem ainda não tem nenhuma ação
          </label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="text-sm h-9 rounded-md border px-3 bg-background"
          >
            <option value="conexoes">Ordenar por: conexões</option>
            <option value="enviados">Ordenar por: mensagens enviadas</option>
            <option value="cadastros">Ordenar por: cadastros</option>
            <option value="conclusao">Ordenar por: taxa de conclusão</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        A jornada soma mensagens enviadas nas missões + cadastros feitos pela pessoa. Por isso
        aparecem aqui todos os usuários, mesmo quem nunca recebeu missão.
      </p>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum usuário para mostrar neste período.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Responsável</th>
                <th className="text-right p-2" title="Mensagens enviadas + cadastros feitos.">Conexões</th>
                <th className="text-right p-2" title="Contatos atribuídos a essa pessoa.">Atribuídos</th>
                <th className="text-right p-2" title="Confirmou o envio.">Enviados</th>
                <th className="text-right p-2" title="Contatos cadastrados por essa pessoa no período.">Cadastros</th>
                <th className="text-right p-2" title="Marcou para enviar depois.">Depois</th>
                <th className="text-right p-2" title="Ainda não agiu.">Não enviados</th>
                <th className="text-right p-2" title="Número com erro ou não quer receber.">Arquivados</th>
                <th className="text-right p-2" title="Enviados sobre os contatos que ainda valem envio.">Conclusão</th>
                <th className="text-right p-2">Última ação</th>
                <th className="text-right p-2">Jornada</th>
                <th className="text-right p-2">Enviar</th>
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
                  <td className="p-2 text-right font-semibold">{r.conexoes}</td>
                  <td className="p-2 text-right">{r.atribuidos}</td>
                  <td className="p-2 text-right font-medium text-emerald-700">{r.enviados}</td>
                  <td className="p-2 text-right">{r.cadastros}</td>
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
                  <td className="p-2 text-right">
                    {r.userId ? (
                      <button
                        type="button"
                        onClick={() => setSending(r)}
                        className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted"
                        title="Abre o cartão de desempenho geral com a legenda pronta para mandar no WhatsApp."
                      >
                        Mandar jornada
                      </button>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground"
                        title="Essa pessoa não tem cadastro no app, então não existe cartão de jornada."
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

      {sending?.userId && (
        <SendJourneyDialog
          open
          onOpenChange={(o) => !o && setSending(null)}
          userId={sending.userId}
          nome={sending.nome}
          whatsapp={sending.whatsapp}
          legenda={journeyMessage(sending)}
        />
      )}
    </section>
  );
}


import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Clock, Copy, GitMerge, RefreshCw, RotateCcw, Trash2, Users } from "lucide-react";
import {
  listDuplicateGroups,
  resolveDuplicateGroup,
  rescanDuplicates,
  countDuplicateQueues,
  type DuplicateView,
} from "@/lib/duplicates.functions";
import { MergeContactsModal } from "@/components/MergeContactsModal";
import { DeleteDuplicatesDialog, type DeleteCandidate } from "@/components/DeleteDuplicatesDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPhoneBR } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUserRole } from "@/hooks/use-current-role";
import { CONFIANCA_LABEL, suggestSurvivor, survivorReason, type MergeCandidate } from "@/lib/merge-suggestion";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/duplicidades")({
  head: () => ({
    meta: [
      { title: "Contatos repetidos | Povo que Batalha" },
      { name: "description", content: "Revise e unifique cadastros repetidos da base de contatos." },
    ],
  }),
  component: DupPage,
});

const BADGE: Record<string, string> = {
  forte: "bg-emerald-100 text-emerald-800 border-emerald-200",
  provavel: "bg-amber-100 text-amber-800 border-amber-200",
  possivel: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABEL: Record<string, string> = {
  separados: "Marcado como pessoas diferentes",
  ignorado: "Arquivado",
  mesclado: "Já unificado",
  pendente: "Aguardando revisão",
};

const TABS: Array<{ key: DuplicateView; label: string }> = [
  { key: "revisar", label: "Para revisar" },
  { key: "adiados", label: "Adiados" },
  { key: "decididos", label: "Já decididos" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function DupPage() {
  const listFn = useServerFn(listDuplicateGroups);
  const resolveFn = useServerFn(resolveDuplicateGroup);
  const rescanFn = useServerFn(rescanDuplicates);
  const countsFn = useServerFn(countDuplicateQueues);
  const role = useCurrentUserRole();
  const isAdmin = role === "admin";

  const [view, setView] = useState<DuplicateView>("revisar");
  const q = useQuery({ queryKey: ["dup-groups", view], queryFn: () => listFn({ data: { view } }) });
  const counts = useQuery({ queryKey: ["dup-counts"], queryFn: () => countsFn() });
  const [merging, setMerging] = useState<{ ids: string[]; matchType: string } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState<{ group: DeleteCandidate[]; targets: DeleteCandidate[] } | null>(null);
  // Seleção de cadastros por bloco (chave do grupo -> ids marcados)
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  function toggleSelected(groupKey: string, id: string) {
    setSelected((prev) => {
      const cur = prev[groupKey] ?? [];
      return { ...prev, [groupKey]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });
  }

  function refresh() {
    setSelected({});
    q.refetch();
    counts.refetch();
  }


  async function act(
    pairIds: string[],
    action: "separados" | "arquivar" | "adiar" | "reabrir",
    dias?: number,
  ) {
    try {
      await resolveFn({ data: { pair_ids: pairIds, action, dias } });
      const msg =
        action === "separados"
          ? "Marcado como pessoas diferentes."
          : action === "arquivar"
            ? "Arquivado — não volta mais na fila."
            : action === "reabrir"
              ? "Voltou para a fila de revisão."
              : `Adiado por ${dias} dia(s) — volta sozinho na data.`;
      toast.success(msg, {
        action:
          action === "reabrir"
            ? undefined
            : {
                label: "Desfazer",
                onClick: () => act(pairIds, "reabrir"),
              },
      });
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar");
    }
  }

  async function rescan() {
    setScanning(true);
    try {
      let offset = 0;
      let novos = 0;
      for (let i = 0; i < 40; i++) {
        const r = await rescanFn({ data: { offset, limit: 300 } });
        novos += r.novos;
        offset += r.processados;
        if (r.done) break;
      }
      toast.success(`Verificação concluída — ${novos} novo(s) grupo(s) encontrado(s).`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na verificação");
    } finally {
      setScanning(false);
    }
  }

  const groups = q.data?.groups ?? [];
  const c = counts.data;

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Copy className="h-5 w-5 text-primary" /> Contatos repetidos
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Cada bloco abaixo é uma pessoa que parece ter mais de um cadastro. Ao unificar, o sistema mantém o cadastro
            mais completo e transfere para ele o histórico, as mensagens, as tags e o acesso ao sistema.
          </p>
        </div>
        <Button variant="outline" onClick={rescan} disabled={scanning}>
          <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Verificando…" : "Verificar a base agora"}
        </Button>
      </header>

      {!isAdmin && (
        <div className="rounded-lg border bg-amber-50 text-amber-900 px-4 py-3 text-sm">
          Você pode ver os contatos repetidos, mas só administradores podem unificar ou decidir sobre eles.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const n = c ? c[t.key] : undefined;
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`text-sm px-3 py-1.5 rounded-full border transition ${
                view === t.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
              }`}
            >
              {t.label}
              {typeof n === "number" && <span className="ml-1.5 opacity-80 tabular-nums">({n})</span>}
            </button>
          );
        })}
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {!q.isLoading && groups.length === 0 && (
        <div className="border rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">
          {view === "revisar"
            ? "Nenhum contato repetido pendente. 🎉"
            : view === "adiados"
              ? "Nenhum grupo adiado no momento."
              : "Nenhuma decisão registrada ainda."}
        </div>
      )}

      <div className="space-y-4">
        {groups.map((g) => {
          const contatos = g.contacts as unknown as MergeCandidate[];
          const sugerido = suggestSurvivor(contatos);
          const pairIds = g.pairs.map((p) => p.id);
          const grupoParaExcluir = contatos as unknown as DeleteCandidate[];
          const marcados = selected[g.key] ?? [];
          const podeExcluir = view === "revisar" && isAdmin;
          function abrirExclusao(ids: string[]) {
            const targets = grupoParaExcluir.filter((c) => ids.includes(c.id));
            if (targets.length === 0) return;
            setDeleting({ group: grupoParaExcluir, targets });
          }
          return (
            <div key={g.key} className="border rounded-xl bg-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  {contatos.length} cadastros parecem ser {sugerido?.nome ?? "a mesma pessoa"}
                </div>
                <div className="flex items-center gap-2">
                  {view === "adiados" && g.snoozed_until && (
                    <span className="text-[11px] px-2 py-1 rounded-full border bg-background text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Volta em {formatDate(g.snoozed_until)}
                    </span>
                  )}
                  {view === "decididos" && (
                    <span className="text-[11px] px-2 py-1 rounded-full border bg-background text-muted-foreground">
                      {STATUS_LABEL[g.status] ?? g.status}
                    </span>
                  )}
                  <span
                    className={`text-[11px] px-2 py-1 rounded-full border uppercase tracking-wide font-medium ${
                      BADGE[g.match_type] ?? BADGE.possivel
                    }`}
                  >
                    Confiança {CONFIANCA_LABEL[g.match_type] ?? g.match_type}
                  </span>
                </div>
              </div>

              <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {contatos.map((c2) => (
                  <div
                    key={c2.id}
                    className={`rounded-lg border p-3 text-sm ${
                      sugerido?.id === c2.id ? "border-primary bg-primary/5" : "bg-background"
                    }`}
                  >
                    <div className="font-semibold truncate">{c2.nome ?? "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatPhoneBR(c2.phone_e164 ?? null) || c2.phone_raw || "sem telefone"}
                    </div>
                    {c2.email && <div className="text-xs text-muted-foreground truncate">{c2.email}</div>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sugerido?.id === c2.id && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary font-medium">
                          Sugerido para ficar — {survivorReason(c2)}
                        </span>
                      )}
                      {c2.is_system_user && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-800">Usuário</span>
                      )}
                      {c2.arquivado_at && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          Fora da base
                        </span>
                      )}
                      {c2.origem && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800">{c2.origem}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
                {view === "revisar" && isAdmin && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => setMerging({ ids: contatos.map((x) => x.id), matchType: g.match_type })}
                    >
                      <GitMerge className="h-4 w-4 mr-1.5" /> Unificar cadastros
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => act(pairIds, "separados")}>
                      São pessoas diferentes
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="ghost">
                          Decidir depois
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        <DropdownMenuItem onClick={() => act(pairIds, "adiar", 7)}>
                          Lembrar em 7 dias
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => act(pairIds, "adiar", 30)}>
                          Lembrar em 30 dias
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => act(pairIds, "arquivar")}>
                          Arquivar de vez (não volta mais)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
                {view !== "revisar" && isAdmin && g.status !== "mesclado" && (
                  <Button size="sm" variant="outline" onClick={() => act(pairIds, "reabrir")}>
                    <RotateCcw className="h-4 w-4 mr-1.5" /> Voltar para a fila
                  </Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {g.pairs[0]?.reason ?? "Detecção automática"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {merging && (
        <MergeContactsModal
          ids={merging.ids}
          matchType={merging.matchType}
          onClose={() => setMerging(null)}
          onMerged={() => refresh()}
        />
      )}
    </div>
  );
}

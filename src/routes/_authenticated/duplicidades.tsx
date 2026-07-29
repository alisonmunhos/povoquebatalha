import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, GitMerge, RefreshCw, Users } from "lucide-react";
import {
  listDuplicateGroups,
  resolveDuplicateGroup,
  rescanDuplicates,
} from "@/lib/duplicates.functions";
import { MergeContactsModal } from "@/components/MergeContactsModal";
import { formatPhoneBR } from "@/lib/phone";
import { Button } from "@/components/ui/button";
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

function DupPage() {
  const listFn = useServerFn(listDuplicateGroups);
  const resolveFn = useServerFn(resolveDuplicateGroup);
  const rescanFn = useServerFn(rescanDuplicates);
  const q = useQuery({ queryKey: ["dup-groups"], queryFn: () => listFn() });
  const [merging, setMerging] = useState<{ ids: string[]; matchType: string } | null>(null);
  const [scanning, setScanning] = useState(false);

  async function act(pairIds: string[], action: "separados" | "ignorar") {
    try {
      await resolveFn({ data: { pair_ids: pairIds, action } });
      toast.success(action === "separados" ? "Marcado como pessoas diferentes." : "Adiado para revisão depois.");
      q.refetch();
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
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na verificação");
    } finally {
      setScanning(false);
    }
  }

  const groups = q.data?.groups ?? [];

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

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {!q.isLoading && groups.length === 0 && (
        <div className="border rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">
          Nenhum contato repetido pendente. 🎉
        </div>
      )}

      <div className="space-y-4">
        {groups.map((g) => {
          const contatos = g.contacts as unknown as MergeCandidate[];
          const sugerido = suggestSurvivor(contatos);
          const pairIds = g.pairs.map((p) => p.id);
          return (
            <div key={g.key} className="border rounded-xl bg-card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Users className="h-4 w-4 text-primary" />
                  {contatos.length} cadastros parecem ser {sugerido?.nome ?? "a mesma pessoa"}
                </div>
                <span
                  className={`text-[11px] px-2 py-1 rounded-full border uppercase tracking-wide font-medium ${
                    BADGE[g.match_type] ?? BADGE.possivel
                  }`}
                >
                  Confiança {CONFIANCA_LABEL[g.match_type] ?? g.match_type}
                </span>
              </div>

              <div className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {contatos.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 text-sm ${
                      sugerido?.id === c.id ? "border-primary bg-primary/5" : "bg-background"
                    }`}
                  >
                    <div className="font-semibold truncate">{c.nome ?? "Sem nome"}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatPhoneBR(c.phone_e164 ?? null) || c.phone_raw || "sem telefone"}
                    </div>
                    {c.email && <div className="text-xs text-muted-foreground truncate">{c.email}</div>}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {sugerido?.id === c.id && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary font-medium">
                          Sugerido para ficar — {survivorReason(c)}
                        </span>
                      )}
                      {c.is_system_user && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-800">Usuário</span>
                      )}
                      {c.arquivado_at && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          Fora da base
                        </span>
                      )}
                      {c.origem && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800">{c.origem}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setMerging({ ids: contatos.map((c) => c.id), matchType: g.match_type })}>
                  <GitMerge className="h-4 w-4 mr-1.5" /> Unificar cadastros
                </Button>
                <Button size="sm" variant="outline" onClick={() => act(pairIds, "separados")}>
                  São pessoas diferentes
                </Button>
                <Button size="sm" variant="ghost" onClick={() => act(pairIds, "ignorar")}>
                  Decidir depois
                </Button>
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
          onMerged={() => q.refetch()}
        />
      )}
    </div>
  );
}

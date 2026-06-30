import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Filter, Trash2, Users, ArrowRight } from "lucide-react";
import { listSegments, deleteSegment, countSegment } from "@/lib/segments.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/segmentos")({
  head: () => ({ meta: [{ title: "Segmentos" }] }),
  component: SegmentsPage,
});

function SegmentsPage() {
  const listFn = useServerFn(listSegments);
  const delFn = useServerFn(deleteSegment);
  const countFn = useServerFn(countSegment);
  const q = useQuery({ queryKey: ["segments"], queryFn: () => listFn() });

  async function remove(id: string, nome: string) {
    if (!confirm(`Excluir segmento "${nome}"?`)) return;
    await delFn({ data: { id } }); toast.success("Segmento excluído"); q.refetch();
  }
  async function showCount(id: string) {
    const r = await countFn({ data: { id } });
    toast.info(`${r.total} contato(s)`);
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Filter className="h-5 w-5 text-primary" /> Segmentos</h1>
        <Link to="/contatos" className="text-sm text-primary hover:underline">Criar a partir de filtros → CRM</Link>
      </header>

      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {(q.data?.rows.length ?? 0) === 0 && !q.isLoading && (
        <div className="border rounded-xl p-8 text-center text-sm text-muted-foreground bg-card">
          Nenhum segmento salvo ainda. Vá em <Link to="/contatos" className="text-primary underline">Contatos</Link>, configure os filtros e clique em "Salvar como segmento".
        </div>
      )}

      <ul className="grid gap-3 md:grid-cols-2">
        {q.data?.rows.map((s) => {
          const filtroJson = s.filtro as Record<string, unknown> | null;
          const filtroKeys = filtroJson ? Object.keys(filtroJson).filter((k) => filtroJson[k] !== undefined && filtroJson[k] !== "" && filtroJson[k] !== null) : [];
          const memberIds = (s.member_ids as string[] | null) ?? [];
          return (
            <li key={s.id} className="border rounded-xl bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{s.nome}</div>
                  <div className="text-xs text-muted-foreground">{s.descricao || "—"}</div>
                </div>
                <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${s.tipo === "dinamico" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"}`}>{s.tipo}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {s.tipo === "estatico" ? `${memberIds.length} contato(s) fixos` : `${filtroKeys.length} filtro(s) ativos: ${filtroKeys.slice(0, 4).join(", ") || "nenhum"}`}
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <button onClick={() => showCount(s.id)} className="text-xs text-primary hover:underline inline-flex items-center gap-1"><Users className="h-3 w-3" /> Contar</button>
                <Link to="/contatos" search={{ segment: s.id }} className="text-xs text-primary hover:underline inline-flex items-center gap-1">Abrir no CRM <ArrowRight className="h-3 w-3" /></Link>
                <button onClick={() => remove(s.id, s.nome)} className="p-1.5 hover:bg-accent rounded text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

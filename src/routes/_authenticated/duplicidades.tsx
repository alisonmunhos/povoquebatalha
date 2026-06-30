import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { listPendingDuplicates, resolveDuplicate } from "@/lib/duplicates.functions";
import { formatPhoneBR } from "@/lib/phone";

export const Route = createFileRoute("/_authenticated/duplicidades")({
  head: () => ({ meta: [{ title: "Possíveis Duplicidades" }] }),
  component: DupPage,
});

function DupPage() {
  const listFn = useServerFn(listPendingDuplicates);
  const resolveFn = useServerFn(resolveDuplicate);
  const q = useQuery({ queryKey: ["dups"], queryFn: () => listFn() });

  async function act(id: string, action: "ignorar" | "separados") {
    await resolveFn({ data: { id, action } });
    q.refetch();
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Copy className="h-5 w-5 text-primary" /> Possíveis Duplicidades</h1>
        <p className="text-sm text-muted-foreground mt-1">Revise os pares marcados pela importação ou pelo recadastro.</p>
      </header>

      <div className="border rounded-xl bg-card overflow-hidden">
        {q.isLoading && <div className="p-6 text-sm text-muted-foreground">Carregando…</div>}
        {(q.data?.rows.length ?? 0) === 0 && !q.isLoading && (
          <div className="p-6 text-sm text-muted-foreground">Nenhuma duplicidade pendente. 🎉</div>
        )}
        <ul className="divide-y">
          {q.data?.rows.map((d) => (
            <li key={d.id} className="p-4 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-4 items-center">
              <Card label="Novo / importado" c={d.a} />
              <Card label="Já cadastrado" c={d.b} />
              <div className="flex flex-col gap-2 text-xs">
                <span className="text-center px-2 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">
                  {d.match_type}
                </span>
                <button onClick={() => act(d.id, "separados")} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                  Manter separados
                </button>
                <button onClick={() => act(d.id, "ignorar")} className="rounded-md border px-3 py-1.5 hover:bg-muted">
                  Ignorar
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Card({ label, c }: { label: string; c: { nome: string; phone_e164: string | null; email: string | null; origem: string } | null }) {
  if (!c) return <div className="text-xs text-muted-foreground">{label}: contato removido</div>;
  return (
    <div className="rounded-md border p-3 bg-background">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium">{c.nome}</div>
      <div className="text-xs text-muted-foreground tabular-nums">{formatPhoneBR(c.phone_e164)}</div>
      {c.email && <div className="text-xs text-muted-foreground">{c.email}</div>}
      <div className="text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded bg-muted">{c.origem}</div>
    </div>
  );
}

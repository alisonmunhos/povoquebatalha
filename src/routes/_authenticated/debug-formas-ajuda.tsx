// Página TEMPORÁRIA de diagnóstico — ver debug-formas-ajuda.functions.ts.
// Remover junto com a server function depois que a causa for confirmada.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { debugFormasAjuda } from "@/lib/debug-formas-ajuda.functions";

export const Route = createFileRoute("/_authenticated/debug-formas-ajuda")({
  head: () => ({ meta: [{ title: "Debug formas_ajuda" }] }),
  component: DebugPage,
});

function DebugPage() {
  const fn = useServerFn(debugFormasAjuda);
  const q = useQuery({ queryKey: ["debug-formas-ajuda"], queryFn: () => fn() });

  return (
    <div className="p-6 md:p-10 max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Diagnóstico: filtro formas_ajuda</h1>
      <p className="text-sm text-muted-foreground">
        Testa várias formas de filtrar `formas_ajuda` por "panfletagem_banquinha" contra o banco
        real, com a sua sessão autenticada. Esperado: 27 contatos não arquivados.
      </p>
      {q.isLoading && <p>Carregando…</p>}
      {q.error && (
        <pre className="text-sm text-destructive whitespace-pre-wrap">{String(q.error)}</pre>
      )}
      {q.data && (
        <pre className="text-sm bg-card border rounded-lg p-4 whitespace-pre-wrap">
          {JSON.stringify(q.data, null, 2)}
        </pre>
      )}
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listContacts, setOptOut } from "@/lib/contacts.functions";
import { formatPhoneBR } from "@/lib/phone";
import { Users, Search, UserMinus, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/contatos")({
  head: () => ({ meta: [{ title: "Contatos" }] }),
  component: Contatos,
});

function Contatos() {
  const listFn = useServerFn(listContacts);
  const optFn = useServerFn(setOptOut);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const q = useQuery({
    queryKey: ["contacts", search, page],
    queryFn: () => listFn({ data: { search, page, pageSize } }),
  });

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Contatos</h1>
        </div>
        <div className="text-sm text-muted-foreground">
          {q.data?.total ?? 0} contatos cadastrados
        </div>
      </div>

      <div className="mt-6 flex items-center gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nome, telefone ou e-mail…"
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-6 border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">Telefone</th>
              <th className="text-left px-4 py-3">Cidade/UF</th>
              <th className="text-left px-4 py-3">Origem</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Carregando…
                </td>
              </tr>
            )}
            {q.data?.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum contato encontrado.
                </td>
              </tr>
            )}
            {q.data?.rows.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3 font-medium">{c.nome}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">
                  {formatPhoneBR(c.phone_e164)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[c.cidade, c.uf].filter(Boolean).join("/") || "—"}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs uppercase tracking-wide bg-muted px-2 py-0.5 rounded">
                    {c.origem}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.opt_out_at ? (
                    <span className="text-xs text-destructive">Opt-out</span>
                  ) : c.consentimento_whatsapp ? (
                    <span className="text-xs text-emerald-600">Ativo</span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sem consentimento</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={async () => {
                      await optFn({ data: { id: c.id, optOut: !c.opt_out_at } });
                      q.refetch();
                    }}
                    className="text-xs inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    {c.opt_out_at ? (
                      <>
                        <UserCheck className="h-3.5 w-3.5" /> Reativar
                      </>
                    ) : (
                      <>
                        <UserMinus className="h-3.5 w-3.5" /> Opt-out
                      </>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {q.data && q.data.total > pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {Math.ceil(q.data.total / pageSize)}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 border rounded-md disabled:opacity-50"
            >
              Anterior
            </button>
            <button
              disabled={page >= Math.ceil(q.data.total / pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 border rounded-md disabled:opacity-50"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

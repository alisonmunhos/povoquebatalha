import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listContacts, setOptOut, archiveContact } from "@/lib/contacts.functions";
import { formatPhoneBR } from "@/lib/phone";
import { Users, Search, UserMinus, UserCheck, Pencil, Copy, MessageCircle, Archive, ArchiveRestore } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contatos/")({
  head: () => ({ meta: [{ title: "Contatos" }] }),
  component: Contatos,
});

function Contatos() {
  const listFn = useServerFn(listContacts);
  const optFn = useServerFn(setOptOut);
  const archFn = useServerFn(archiveContact);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  const pageSize = 25;

  const q = useQuery({
    queryKey: ["contacts", search, page, includeArchived],
    queryFn: () => listFn({ data: { search, page, pageSize, includeArchived } }),
  });

  return (
    <div className="p-6 md:p-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Contatos</h1>
        </div>
        <div className="text-sm text-muted-foreground">{q.data?.total ?? 0} cadastrados</div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nome, telefone ou e-mail…"
            className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm" />
        </div>
        <label className="text-xs text-muted-foreground flex items-center gap-1">
          <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
          Incluir arquivados
        </label>
      </div>

      <div className="mt-6 border rounded-xl overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3">Nome</th>
              <th className="text-left px-4 py-3">WhatsApp</th>
              <th className="text-left px-4 py-3">Cidade/UF</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Carregando…</td></tr>
            )}
            {q.data?.rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Nenhum contato encontrado.</td></tr>
            )}
            {q.data?.rows.map((c) => {
              const digits = (c.phone_e164 ?? "").replace(/\D/g, "");
              return (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-3 font-medium">
                    <Link to="/contatos/$id" params={{ id: c.id }} className="hover:underline">{c.nome}</Link>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatPhoneBR(c.phone_e164)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{[c.cidade, c.uf].filter(Boolean).join("/") || "—"}</td>
                  <td className="px-4 py-3 space-x-1">
                    {c.arquivado_at && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Arquivado</span>}
                    {c.opt_out_at && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Opt-out</span>}
                    {!c.opt_out_at && c.consentimento_whatsapp && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">Ativo</span>}
                    {c.phone_status && c.phone_status !== "valido" && <span className="text-[10px] uppercase px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">{c.phone_status}</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <Link to="/contatos/$id" params={{ id: c.id }} className="p-1.5 hover:bg-accent rounded" title="Ver/Editar"><Pencil className="h-3.5 w-3.5" /></Link>
                      {digits && (
                        <>
                          <button onClick={() => { navigator.clipboard.writeText(c.phone_e164 ?? ""); toast.success("WhatsApp copiado"); }} className="p-1.5 hover:bg-accent rounded" title="Copiar WhatsApp"><Copy className="h-3.5 w-3.5" /></button>
                          <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer" className="p-1.5 hover:bg-accent rounded text-emerald-600" title="Abrir conversa"><MessageCircle className="h-3.5 w-3.5" /></a>
                        </>
                      )}
                      <button onClick={async () => { await optFn({ data: { id: c.id, optOut: !c.opt_out_at } }); q.refetch(); }} className="p-1.5 hover:bg-accent rounded" title={c.opt_out_at ? "Reativar" : "Não enviar"}>
                        {c.opt_out_at ? <UserCheck className="h-3.5 w-3.5" /> : <UserMinus className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={async () => { await archFn({ data: { id: c.id, archived: !c.arquivado_at } }); q.refetch(); }} className="p-1.5 hover:bg-accent rounded" title={c.arquivado_at ? "Desarquivar" : "Arquivar"}>
                        {c.arquivado_at ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {q.data && q.data.total > pageSize && (
        <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
          <span>Página {page} de {Math.ceil(q.data.total / pageSize)}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1.5 border rounded-md disabled:opacity-50">Anterior</button>
            <button disabled={page >= Math.ceil(q.data.total / pageSize)} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 border rounded-md disabled:opacity-50">Próxima</button>
          </div>
        </div>
      )}
    </div>
  );
}

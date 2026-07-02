import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search, Send, MessageCircle, CheckSquare, Square } from "lucide-react";
import { listCommContactsForBulk } from "@/lib/communication.functions";
import { SendWhatsAppWizard } from "@/components/SendWhatsAppWizard";

export const Route = createFileRoute("/_authenticated/comunicacao/contatos")({
  head: () => ({ meta: [{ title: "Contatos — Comunicação" }] }),
  component: Page,
});

function Page() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [wizardOpen, setWizardOpen] = useState(false);
  const listFn = useServerFn(listCommContactsForBulk);
  const q = useQuery({
    queryKey: ["comm-contacts", search],
    queryFn: () => listFn({ data: { search: search || undefined, limit: 300 } }),
  });

  const rows = q.data ?? [];
  const allSelected = useMemo(() => rows.length > 0 && rows.every((r) => selected.has(r.id)), [rows, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex items-center gap-3">
        <MessageCircle className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Contatos para disparo</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Apenas contatos com WhatsApp válido e sem opt-out. Lista somente leitura — para editar, use Gestão da Base.
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border rounded-lg p-3 bg-muted/10">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, cidade, bairro…"
            className="w-full text-sm pl-8 pr-2 py-2 rounded-md border bg-background"
          />
        </div>
        <div className="text-xs text-muted-foreground">
          {rows.length.toLocaleString("pt-BR")} contatos · {selected.size} selecionado(s)
        </div>
        <button
          disabled={selected.size === 0}
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-40"
        >
          <Send className="h-4 w-4" /> Enviar em massa ({selected.size})
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="p-2 w-8">
                <button onClick={toggleAll} title="Selecionar todos">
                  {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                </button>
              </th>
              <th className="p-2 text-left">Nome</th>
              <th className="p-2 text-left">Telefone</th>
              <th className="p-2 text-left">Cidade/UF</th>
              <th className="p-2 text-left">Bairro</th>
              <th className="p-2 text-left">Consentimento</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Carregando…</td></tr>}
            {!q.isLoading && rows.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhum contato encontrado.</td></tr>}
            {rows.map((r) => {
              const isSel = selected.has(r.id);
              return (
                <tr key={r.id} className={`border-t hover:bg-muted/30 ${isSel ? "bg-primary/5" : ""}`}>
                  <td className="p-2">
                    <button onClick={() => toggle(r.id)}>
                      {isSel ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />}
                    </button>
                  </td>
                  <td className="p-2 font-medium">{r.nome ?? "—"}</td>
                  <td className="p-2 font-mono text-xs">{r.phone_e164 ?? "—"}</td>
                  <td className="p-2">{r.cidade ? `${r.cidade}/${r.uf ?? ""}` : "—"}</td>
                  <td className="p-2">{r.bairro ?? "—"}</td>
                  <td className="p-2 text-xs">
                    {r.consentimento_whatsapp
                      ? <span className="text-green-700">Sim</span>
                      : <span className="text-muted-foreground">Não informado</span>}
                  </td>
                  <td className="p-2 text-right">
                    <Link
                      to="/comunicacao/inbox"
                      search={{ contact: r.id } as never}
                      className="text-xs text-primary hover:underline"
                    >
                      Abrir chat
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {wizardOpen && (
        <SendWhatsAppWizard
          contactIds={Array.from(selected)}
          onClose={() => setWizardOpen(false)}
          onFinished={() => {
            setWizardOpen(false);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}

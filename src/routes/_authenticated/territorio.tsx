import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getTerritoryOverview, listTerritoryContacts } from "@/lib/territory.functions";
import { MapPin, Users, HeartPulse, BanIcon, Clock3, Search, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/territorio")({
  head: () => ({ meta: [{ title: "Território — Campanha do Povo que Batalha" }] }),
  component: TerritorioPage,
});

function TerritorioPage() {
  const overviewFn = useServerFn(getTerritoryOverview);
  const listFn = useServerFn(listTerritoryContacts);

  const overview = useSuspenseQuery({
    queryKey: ["territory-overview"],
    queryFn: () => overviewFn(),
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const contacts = useQuery({
    queryKey: ["territory-contacts", search, page],
    queryFn: () => listFn({ data: { search: search || undefined, page, pageSize: 30 } }),
  });

  const o = overview.data;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <header>
        <div className="flex items-center gap-2 text-primary">
          <MapPin className="h-5 w-5" />
          <span className="text-xs uppercase tracking-wide font-semibold">Meu território</span>
        </div>
        <h1 className="text-2xl font-semibold mt-1">{o.scopeLabel}</h1>
        {o.restricted && o.scopes.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3 mt-3">
            Você ainda não tem um território atribuído. Peça a um administrador para definir seu escopo em Usuários.
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3">
        <Kpi icon={Users} label="Apoiadores" value={o.kpis.total} color="text-blue-600" />
        <Kpi icon={HeartPulse} label="Engajados 30d" value={o.kpis.engajados} color="text-emerald-600" />
        <Kpi icon={Clock3} label="Recadastro pendente" value={o.kpis.pendentes} color="text-amber-600" />
        <Kpi icon={BanIcon} label="Opt-out" value={o.kpis.optOuts} color="text-rose-600" />
      </section>

      <section className="space-y-2">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por nome, telefone, cidade…"
            className="pl-9"
          />
        </div>

        <div className="border rounded-xl divide-y bg-card overflow-hidden">
          {contacts.isLoading && (
            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
          )}
          {contacts.data && contacts.data.rows.length === 0 && (
            <div className="p-6 text-sm text-muted-foreground text-center">Nenhum contato no território.</div>
          )}
          {contacts.data?.rows.map((c) => (
            <div key={c.id} className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{c.nome ?? "(sem nome)"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[c.bairro, c.cidade, c.uf].filter(Boolean).join(" • ") || "sem endereço"}
                </div>
                <div className="text-xs mt-1 flex flex-wrap gap-1">
                  {c.opt_out_at && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">opt-out</span>}
                  {c.consentimento_whatsapp && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">WhatsApp</span>}
                  {c.lifecycle_status === "importado_aguardando_recadastro" && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">recadastro</span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Link
                  to="/contatos/$id"
                  params={{ id: c.id }}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  Abrir <ExternalLink className="h-3 w-3" />
                </Link>
                {c.phone_e164 && !c.opt_out_at && (
                  <a
                    href={`https://wa.me/${c.phone_e164.replace(/\D/g, "")}`}
                    target="_blank" rel="noreferrer"
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {contacts.data && contacts.data.total > contacts.data.pageSize && (
          <div className="flex items-center justify-between text-sm">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-md border disabled:opacity-50"
            >Anterior</button>
            <span className="text-muted-foreground">Página {page} de {Math.ceil(contacts.data.total / contacts.data.pageSize)}</span>
            <button
              disabled={page >= Math.ceil(contacts.data.total / contacts.data.pageSize)}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1.5 rounded-md border disabled:opacity-50"
            >Próxima</button>
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
  return (
    <div className="border rounded-xl p-3 bg-card">
      <div className={`flex items-center gap-1.5 text-xs ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="uppercase tracking-wide font-semibold">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

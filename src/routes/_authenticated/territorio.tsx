import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { getTerritoryOverview, listTerritoryContacts } from "@/lib/territory.functions";
import { logTerritoryAction } from "@/lib/territory-logs.functions";
import { Users, HeartPulse, BanIcon, Clock3, Search, MessageCircle, CheckCircle2, StickyNote, UserX, Smartphone, Compass, Map as MapIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TerritoryMapView } from "@/components/TerritoryMapView";

export const Route = createFileRoute("/_authenticated/territorio")({
  head: () => ({ meta: [{ title: "Território — Campanha do Povo que Batalha" }] }),
  component: TerritorioPage,
});

type Row = {
  id: string;
  nome: string | null;
  phone_e164: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  lifecycle_status: string | null;
  consentimento_whatsapp: boolean | null;
  opt_out_at: string | null;
};

function TerritorioPage() {
  return (
    <div className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
      <div className="flex items-center gap-2 text-primary">
        <Compass className="h-5 w-5" />
        <h1 className="text-lg font-semibold">Território</h1>
        <span className="text-xs text-muted-foreground ml-2">Ação de campo + mapa geral da base</span>
      </div>

      <Tabs defaultValue="campo" className="w-full">
        <TabsList>
          <TabsTrigger value="campo" className="gap-1.5"><Compass className="h-3.5 w-3.5" /> Ação de Campo</TabsTrigger>
          <TabsTrigger value="mapa" className="gap-1.5"><MapIcon className="h-3.5 w-3.5" /> Mapa</TabsTrigger>
        </TabsList>

        <TabsContent value="campo" className="mt-4">
          <FieldAction />
        </TabsContent>

        <TabsContent value="mapa" className="mt-4">
          <Suspense fallback={<div className="text-sm text-muted-foreground p-4">Carregando mapa…</div>}>
            <TerritoryMapView />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function FieldAction() {
  const overviewFn = useServerFn(getTerritoryOverview);
  const listFn = useServerFn(listTerritoryContacts);
  const logFn = useServerFn(logTerritoryAction);
  const qc = useQueryClient();

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

  const [openNote, setOpenNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const logMut = useMutation({
    mutationFn: (v: { contactId: string; action: "whatsapp_aberto" | "contato_realizado" | "nao_encontrado" | "pediu_atualizacao" | "observacao"; note?: string }) =>
      logFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["territory-contacts"] }),
  });

  function waHref(phone: string, nome: string | null) {
    const digits = phone.replace(/\D/g, "");
    const text = `Olá${nome ? ", " + nome.split(" ")[0] : ""}! Sou da Campanha do Povo que Batalha.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  const o = overview.data;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <section className="grid grid-cols-2 gap-2">
        <Kpi icon={Users} label="Apoiadores" value={o.kpis.total} color="text-blue-600" />
        <Kpi icon={HeartPulse} label="Engajados 30d" value={o.kpis.engajados} color="text-emerald-600" />
        <Kpi icon={Clock3} label="Pendentes" value={o.kpis.pendentes} color="text-amber-600" />
        <Kpi icon={BanIcon} label="Opt-out" value={o.kpis.optOuts} color="text-rose-600" />
      </section>

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar por nome, telefone, cidade…"
          className="pl-9 h-11"
        />
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-center gap-2 p-3 border-b bg-muted/30 rounded-t-xl">
          <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] text-muted-foreground leading-tight">
            Adicione à tela inicial pelo menu do navegador para usar como app.
          </p>
        </div>

        {contacts.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
        {contacts.data && contacts.data.rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">Nenhum contato encontrado.</div>
        )}
        <ul className="divide-y">
          {(contacts.data?.rows ?? []).map((c: Row) => {
            const canWa = !!c.phone_e164 && !c.opt_out_at;
            const isNoteOpen = openNote === c.id;
            return (
              <li key={c.id} className="p-3 space-y-2">
                <div>
                  <div className="font-medium truncate">{c.nome ?? "(sem nome)"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.bairro, c.cidade, c.uf].filter(Boolean).join(" • ") || "sem endereço"}
                  </div>
                  <div className="text-[11px] mt-1 flex flex-wrap gap-1">
                    {c.opt_out_at && <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">opt-out</span>}
                    {c.consentimento_whatsapp && <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">WhatsApp</span>}
                    {c.lifecycle_status === "importado_aguardando_recadastro" && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">recadastro</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <a
                    href={canWa ? waHref(c.phone_e164 as string, c.nome) : undefined}
                    onClick={() => canWa && logMut.mutate({ contactId: c.id, action: "whatsapp_aberto" })}
                    target="_blank"
                    rel="noreferrer"
                    aria-disabled={!canWa}
                    className={`h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium ${
                      canWa
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-muted text-muted-foreground pointer-events-none"
                    }`}
                  >
                    <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
                  </a>
                  <button
                    onClick={() => logMut.mutate({ contactId: c.id, action: "contato_realizado" })}
                    className="h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium border hover:bg-accent"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Contato feito
                  </button>
                  <button
                    onClick={() => logMut.mutate({ contactId: c.id, action: "nao_encontrado" })}
                    className="h-10 rounded-md inline-flex items-center justify-center gap-1.5 text-xs font-medium border hover:bg-accent"
                  >
                    <UserX className="h-3.5 w-3.5" /> Não encontrado
                  </button>
                  <button
                    onClick={() => { setOpenNote(isNoteOpen ? null : c.id); setNoteText(""); }}
                    className="h-10 rounded-md inline-flex items-center justify-center gap-1.5 text-xs font-medium border hover:bg-accent"
                  >
                    <StickyNote className="h-3.5 w-3.5" /> {isNoteOpen ? "Cancelar" : "Observação"}
                  </button>
                </div>

                {isNoteOpen && (
                  <div className="space-y-2">
                    <textarea
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      maxLength={500}
                      rows={2}
                      placeholder="Anote algo curto sobre este contato…"
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setOpenNote(null)}
                        className="h-9 px-3 rounded-md border text-xs"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={!noteText.trim()}
                        onClick={() => {
                          logMut.mutate(
                            { contactId: c.id, action: "observacao", note: noteText.trim() },
                            {
                              onSuccess: () => {
                                setOpenNote(null);
                                setNoteText("");
                              },
                            },
                          );
                        }}
                        className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {contacts.data && contacts.data.total > contacts.data.pageSize && (
        <div className="flex items-center justify-between text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3 py-2 rounded-md border disabled:opacity-50"
          >Anterior</button>
          <span className="text-muted-foreground">
            {page} / {Math.ceil(contacts.data.total / contacts.data.pageSize)}
          </span>
          <button
            disabled={page >= Math.ceil(contacts.data.total / contacts.data.pageSize)}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-2 rounded-md border disabled:opacity-50"
          >Próxima</button>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
  return (
    <div className="border rounded-xl p-3 bg-card">
      <div className={`flex items-center gap-1.5 text-xs ${color}`}>
        <Icon className="h-3.5 w-3.5" />
        <span className="uppercase tracking-wide font-semibold truncate">{label}</span>
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { getTerritoryOverview, listTerritoryContacts, getMyFieldSummaryToday } from "@/lib/territory.functions";
import { logTerritoryAction, undoLastTerritoryLog, resetTerritoryContact } from "@/lib/territory-logs.functions";
import {
  Users, HeartPulse, BanIcon, Clock3, Search, MessageCircle, CheckCircle2,
  StickyNote, UserX, Smartphone, Compass, Map as MapIcon, Loader2, Filter, XCircle, RotateCcw, History,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TerritoryMapView } from "@/components/TerritoryMapView";
import { TerritoryContactLogDrawer } from "@/components/TerritoryContactLogDrawer";

export const Route = createFileRoute("/_authenticated/territorio")({
  head: () => ({ meta: [{ title: "Território — Campanha do Povo que Batalha" }] }),
  component: TerritorioPage,
});

type FieldStatus = "nao_abordado" | "contato_realizado" | "nao_encontrado" | "observacao";
type Period = "today" | "week" | "all";
type SortBy = "nao_abordado_first" | "recent_action" | "alphabetical";

type LastAction = { action: string; note: string | null; created_at: string; user_id: string } | null;

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
  last_action: LastAction;
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

const ACTION_LABEL: Record<string, string> = {
  contato_realizado: "Contato feito",
  nao_encontrado: "Não encontrado",
  observacao: "Observação",
  whatsapp_aberto: "WhatsApp aberto",
  pediu_atualizacao: "Pediu atualização",
};

const ACTION_TOAST: Record<string, string> = {
  contato_realizado: "Contato registrado",
  nao_encontrado: "Marcado como não encontrado",
  observacao: "Observação salva",
  whatsapp_aberto: "WhatsApp registrado",
  pediu_atualizacao: "Registrado como pediu atualização",
};

function formatShortTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function FieldAction() {
  const overviewFn = useServerFn(getTerritoryOverview);
  const listFn = useServerFn(listTerritoryContacts);
  const logFn = useServerFn(logTerritoryAction);
  const undoFn = useServerFn(undoLastTerritoryLog);
  const resetFn = useServerFn(resetTerritoryContact);
  const summaryFn = useServerFn(getMyFieldSummaryToday);
  const qc = useQueryClient();

  const undoMut = useMutation({
    mutationFn: (v: { contactId: string }) => undoFn({ data: v }),
    onSuccess: (res) => {
      if (res?.ok) {
        toast.success("Ação desfeita");
        qc.invalidateQueries({ queryKey: ["territory-contacts"] });
        qc.invalidateQueries({ queryKey: ["territory-summary-today"] });
      } else {
        toast.info("Nada recente para desfazer");
      }
    },
    onError: (e) => toast.error("Não foi possível desfazer", { description: e instanceof Error ? e.message : undefined }),
  });

  const resetMut = useMutation({
    mutationFn: (v: { contactId: string }) => resetFn({ data: v }),
    onSuccess: (res) => {
      if (!res?.deleted) {
        toast.error("Nada para apagar", { description: "O contato não tinha histórico de campo, ou você não tem permissão para removê-lo." });
        return;
      }
      toast.success("Contato voltou para 'Ainda não abordado'");
      qc.invalidateQueries({ queryKey: ["territory-contacts"] });
      qc.invalidateQueries({ queryKey: ["territory-summary-today"] });
    },
    onError: (e) => toast.error("Não foi possível voltar o contato", { description: e instanceof Error ? e.message : undefined }),
  });

  const overview = useSuspenseQuery({
    queryKey: ["territory-overview"],
    queryFn: () => overviewFn(),
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [fieldStatus, setFieldStatus] = useState<FieldStatus[]>([]);
  const [period, setPeriod] = useState<Period>("all");
  const [sortBy, setSortBy] = useState<SortBy>("nao_abordado_first");

  const sinceDays = period === "today" ? 1 : period === "week" ? 7 : undefined;

  const contacts = useQuery({
    queryKey: ["territory-contacts", { search, page, fieldStatus, sinceDays, sortBy }],
    queryFn: () => listFn({
      data: {
        search: search || undefined,
        page,
        pageSize: 30,
        fieldStatus: fieldStatus.length ? fieldStatus : undefined,
        sinceDays,
        sortBy,
        actionScope: "all",
      },
    }),
  });

  const summary = useQuery({
    queryKey: ["territory-summary-today"],
    queryFn: () => summaryFn(),
  });

  const [openNote, setOpenNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");

  const logMut = useMutation({
    mutationFn: (v: { contactId: string; action: "whatsapp_aberto" | "contato_realizado" | "nao_encontrado" | "pediu_atualizacao" | "observacao"; note?: string }) =>
      logFn({ data: v }),
    onSuccess: (_res, vars) => {
      toast.success(ACTION_TOAST[vars.action] ?? "Registrado", {
        description: "Contato saiu desta lista e agora aparece no filtro correspondente.",
        action: vars.action !== "observacao" ? {
          label: "Desfazer",
          onClick: () => undoMut.mutate({ contactId: vars.contactId }),
        } : undefined,
      });
      qc.invalidateQueries({ queryKey: ["territory-contacts"] });
      qc.invalidateQueries({ queryKey: ["territory-summary-today"] });
    },
    onError: (e) => {
      toast.error("Não foi possível registrar", { description: e instanceof Error ? e.message : "Tente novamente." });
    },
  });

  const pendingContactId = logMut.isPending ? logMut.variables?.contactId : undefined;

  function waHref(phone: string, nome: string | null) {
    const digits = phone.replace(/\D/g, "");
    const text = `Olá${nome ? ", " + nome.split(" ")[0] : ""}! Sou da Campanha do Povo que Batalha.`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  }

  const o = overview.data;
  const counts = contacts.data?.counts;

  const toggleStatus = (s: FieldStatus) => {
    setPage(1);
    setFieldStatus((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const clearFilters = () => {
    setFieldStatus([]); setPeriod("all"); setSortBy("nao_abordado_first"); setPage(1);
  };

  const activeFilterCount = fieldStatus.length + (period !== "all" ? 1 : 0) + (sortBy !== "nao_abordado_first" ? 1 : 0);

  const s = summary.data;
  const hasSummaryActivity = !!s && (s.contato_realizado + s.nao_encontrado + s.observacao + s.whatsapp_aberto) > 0;

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <section className="grid grid-cols-2 gap-2">
        <Kpi icon={Users} label="Apoiadores" value={o.kpis.total} color="text-blue-600" />
        <Kpi icon={HeartPulse} label="Engajados 30d" value={o.kpis.engajados} color="text-emerald-600" />
        <Kpi icon={Clock3} label="Pendentes" value={o.kpis.pendentes} color="text-amber-600" />
        <Kpi icon={BanIcon} label="Opt-out" value={o.kpis.optOuts} color="text-rose-600" />
      </section>

      {/* Resumo do dia */}
      {hasSummaryActivity && (
        <div className="rounded-xl border bg-emerald-50/60 p-3">
          <div className="text-[11px] uppercase tracking-wide text-emerald-800 font-semibold mb-1">Seu dia em campo</div>
          <div className="text-sm text-emerald-900 flex flex-wrap gap-x-3 gap-y-1">
            <span><b>{s!.totalContatos}</b> contato(s) trabalhado(s)</span>
            <span>· <b>{s!.contato_realizado}</b> contato feito</span>
            <span>· <b>{s!.nao_encontrado}</b> não encontrado</span>
            <span>· <b>{s!.observacao}</b> observação</span>
            {s!.whatsapp_aberto > 0 && <span>· <b>{s!.whatsapp_aberto}</b> WhatsApp aberto</span>}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Buscar por nome, telefone, cidade…"
          className="pl-9 h-11"
        />
      </div>

      {/* Barra de filtros */}
      <div className="rounded-xl border bg-card p-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" /> Filtros
            {activeFilterCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">{activeFilterCount}</span>}
          </div>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <XCircle className="h-3 w-3" /> limpar
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={fieldStatus.includes("nao_abordado")} onClick={() => toggleStatus("nao_abordado")}>
            Ainda não abordado
          </FilterChip>
          <FilterChip active={fieldStatus.includes("contato_realizado")} onClick={() => toggleStatus("contato_realizado")} tone="emerald">
            Contato feito {counts && `(${counts.contato_realizado})`}
          </FilterChip>
          <FilterChip active={fieldStatus.includes("nao_encontrado")} onClick={() => toggleStatus("nao_encontrado")} tone="amber">
            Não encontrado {counts && `(${counts.nao_encontrado})`}
          </FilterChip>
          <FilterChip active={fieldStatus.includes("observacao")} onClick={() => toggleStatus("observacao")} tone="sky">
            Com observação {counts && `(${counts.observacao})`}
          </FilterChip>
        </div>

        <div className="flex flex-wrap gap-3 items-center pt-1">
          <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            Período:
            <select value={period} onChange={(e) => { setPeriod(e.target.value as Period); setPage(1); }} className="h-7 rounded border bg-background px-1.5 text-xs">
              <option value="all">Todos</option>
              <option value="today">Hoje</option>
              <option value="week">Últimos 7 dias</option>
            </select>
          </label>
          <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            Ordenar:
            <select value={sortBy} onChange={(e) => { setSortBy(e.target.value as SortBy); setPage(1); }} className="h-7 rounded border bg-background px-1.5 text-xs">
              <option value="nao_abordado_first">Não abordados primeiro</option>
              <option value="recent_action">Ações mais recentes</option>
              <option value="alphabetical">Alfabético</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-start gap-2 p-3 border-b bg-muted/30 rounded-t-xl">
          <Smartphone className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-[11px] text-muted-foreground leading-tight space-y-1">
            <p>Adicione à tela inicial pelo menu do navegador para usar como app.</p>
            <p>Contatos marcados como <b>Contato feito</b> ou <b>Não encontrado</b> saem desta lista e passam a aparecer nos filtros correspondentes acima. Use <b>Desfazer</b> no aviso ou o botão <b>Voltar para não abordado</b> no card para reverter.</p>
          </div>
        </div>

        {contacts.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
        {contacts.data && contacts.data.rows.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">Nenhum contato encontrado com esses filtros.</div>
        )}
        <ul className="divide-y">
          {(contacts.data?.rows ?? []).map((c: Row) => {
            const canWa = !!c.phone_e164 && !c.opt_out_at;
            const isNoteOpen = openNote === c.id;
            const isPending = pendingContactId === c.id;
            const la = c.last_action;
            return (
              <li key={c.id} className="p-3 space-y-2">
                <div>
                  <div className="font-medium truncate">{c.nome ?? "(sem nome)"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[c.bairro, c.cidade, c.uf].filter(Boolean).join(" • ") || "sem endereço"}
                  </div>
                  <div className="text-[11px] mt-1 flex flex-wrap gap-1 items-center">
                    {la && <LastActionBadge action={la.action} at={la.created_at} />}
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
                    disabled={isPending}
                    onClick={() => logMut.mutate({ contactId: c.id, action: "contato_realizado" })}
                    className="h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium border hover:bg-accent disabled:opacity-60"
                  >
                    {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {isPending ? "Registrando…" : "Contato feito"}
                  </button>
                  <button
                    disabled={isPending}
                    onClick={() => logMut.mutate({ contactId: c.id, action: "nao_encontrado" })}
                    className="h-10 rounded-md inline-flex items-center justify-center gap-1.5 text-xs font-medium border hover:bg-accent disabled:opacity-60"
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

                {la && (
                  <button
                    disabled={resetMut.isPending && resetMut.variables?.contactId === c.id}
                    onClick={() => {
                      if (window.confirm("Voltar este contato para 'Ainda não abordado'? Isso apaga o histórico de campo dele.")) {
                        resetMut.mutate({ contactId: c.id });
                      }
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-60"
                  >
                    <RotateCcw className="h-3 w-3" /> Voltar para "Ainda não abordado"
                  </button>
                )}

                {la?.note && !isNoteOpen && (
                  <div className="text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-1 border">
                    <span className="font-medium text-foreground">Última obs.:</span> {la.note}
                  </div>
                )}

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
                        disabled={!noteText.trim() || isPending}
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

function FilterChip({ active, onClick, children, tone = "primary" }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "primary" | "emerald" | "amber" | "sky" }) {
  const toneClass = tone === "emerald" ? "border-emerald-300 text-emerald-800 bg-emerald-50"
    : tone === "amber" ? "border-amber-300 text-amber-800 bg-amber-50"
    : tone === "sky" ? "border-sky-300 text-sky-800 bg-sky-50"
    : "border-primary/40 text-primary bg-primary/5";
  return (
    <button
      onClick={onClick}
      className={`h-7 px-2.5 rounded-full border text-[11px] font-medium transition ${
        active ? toneClass : "border-border text-muted-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}

function LastActionBadge({ action, at }: { action: string; at: string }) {
  const label = ACTION_LABEL[action] ?? action;
  const tone = action === "contato_realizado" ? "bg-emerald-100 text-emerald-800"
    : action === "nao_encontrado" ? "bg-amber-100 text-amber-800"
    : action === "observacao" ? "bg-sky-100 text-sky-800"
    : "bg-muted text-muted-foreground";
  const icon = action === "contato_realizado" ? <CheckCircle2 className="h-3 w-3" />
    : action === "nao_encontrado" ? <UserX className="h-3 w-3" />
    : action === "observacao" ? <StickyNote className="h-3 w-3" />
    : <MessageCircle className="h-3 w-3" />;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${tone}`} title={new Date(at).toLocaleString("pt-BR")}>
      {icon}
      <span>{label} · {formatShortTime(at)}</span>
    </span>
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

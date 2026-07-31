// Módulo Agitação — mobile-first, sem mapa.
// Cards de contatos captados pelo próprio usuário, com ações rápidas.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Zap, MessageCircle, CheckCircle2, StickyNote, Search, Loader2, Phone, MapPin, History,
  X, ExternalLink, Filter, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { listMyAgitacaoContacts, logAgitacaoAction } from "@/lib/agitacao.functions";
import { listMyMissions } from "@/lib/agitation-missions.functions";
import { ImpactBanner } from "@/components/ImpactBanner";
import { Input } from "@/components/ui/input";
import { TerritoryContactLogDrawer } from "@/components/TerritoryContactLogDrawer";
import { useCurrentUserRole } from "@/hooks/use-current-role";

export const Route = createFileRoute("/_authenticated/agitacao")({
  head: () => ({ meta: [{ title: "Agitação — Povo que Batalha" }] }),
  component: AgitacaoPage,
});

type AgitacaoAction = "whatsapp_aberto" | "contato_realizado" | "pediu_atualizacao" | "nao_respondeu" | "observacao";
type FieldStatus = "nao_abordado" | "confirmado" | "sem_resposta" | "observacao" | "pediu_atualizacao";
type SortBy = "inclusion" | "alphabetical" | "recent" | "oldest" | "nao_abordado_first";

const ACTION_TOAST: Record<AgitacaoAction, string> = {
  whatsapp_aberto: "WhatsApp registrado",
  contato_realizado: "Contato confirmado",
  pediu_atualizacao: "Registrado como pediu atualização",
  nao_respondeu: "Marcado como sem resposta",
  observacao: "Observação salva",
};

// Vocabulário do Agitação (bate com labels do TerritoryContactLogDrawer contexto="agitacao").
const ACTION_LABEL: Record<string, string> = {
  contato_realizado: "Confirmado",
  nao_respondeu: "Sem resposta",
  observacao: "Observação",
  whatsapp_aberto: "WhatsApp aberto",
  pediu_atualizacao: "Pediu atualização",
};

const ACTION_TONE: Record<string, string> = {
  contato_realizado: "bg-emerald-100 text-emerald-800",
  nao_respondeu: "bg-amber-100 text-amber-800",
  observacao: "bg-sky-100 text-sky-800",
  whatsapp_aberto: "bg-emerald-50 text-emerald-700",
  pediu_atualizacao: "bg-violet-100 text-violet-800",
};

function formatShortTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

type LastAction = { action: string; note: string | null; created_at: string; user_id: string } | null;

type AgitacaoContact = {
  id: string;
  nome: string | null;
  phone_e164: string | null;
  phone_raw: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  lifecycle_status: string | null;
  source_form_type: string | null;
  contato_realizado: boolean;
  last_action: LastAction;
};

function AgitacaoPage() {
  const listFn = useServerFn(listMyAgitacaoContacts);
  const logFn = useServerFn(logAgitacaoAction);
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [fieldStatus, setFieldStatus] = useState<FieldStatus[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("inclusion");
  const [histFor, setHistFor] = useState<AgitacaoContact | null>(null);
  const [detailFor, setDetailFor] = useState<AgitacaoContact | null>(null);

  const searchActive = search.trim().length > 0;
  const filtersPaused = searchActive && fieldStatus.length > 0;
  const effectiveFieldStatus = searchActive ? undefined : (fieldStatus.length ? fieldStatus : undefined);

  const q = useQuery({
    queryKey: ["agitacao", search, effectiveFieldStatus, sortBy],
    queryFn: () =>
      listFn({ data: {
        search: search || undefined,
        fieldStatus: effectiveFieldStatus,
        sortBy,
        limit: 200,
      } }),
  });

  const logMut = useMutation({
    mutationFn: (v: { contactId: string; action: AgitacaoAction; note?: string }) =>
      logFn({ data: { contact_id: v.contactId, action: v.action, observacao: v.note ?? null } }),
    onSuccess: (_r, vars) => {
      toast.success(ACTION_TOAST[vars.action] ?? "Registrado");
      qc.invalidateQueries({ queryKey: ["agitacao"] });
      qc.invalidateQueries({ queryKey: ["territory-contact-logs"] });
    },
    onError: (e) => toast.error("Não foi possível registrar", { description: e instanceof Error ? e.message : "Tente novamente." }),
  });

  const pendingKey = logMut.isPending && logMut.variables
    ? `${logMut.variables.contactId}:${logMut.variables.action}`
    : null;

  function waLink(phoneE164: string | null, raw: string | null): string {
    const digits = (phoneE164 ?? raw ?? "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "#";
  }

  const stats = q.data?.stats;
  const counts = q.data?.counts;
  const role = useCurrentUserRole();
  const isAdminLike = role === "admin" || role === "operador" || role === "vrm";

  const toggleStatus = (s: FieldStatus) => {
    setFieldStatus((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };
  // Zera TUDO — search, chips e classificação — pra que "Limpar filtros" faça o que promete.
  const clearFilters = () => { setFieldStatus([]); setSortBy("inclusion"); setSearch(""); };
  const activeFilterCount =
    fieldStatus.length + (sortBy !== "inclusion" ? 1 : 0) + (search.trim() ? 1 : 0);

  // Cards clicáveis: cada um aplica o filtro correspondente à lista.
  const setOnlyStatus = (s: FieldStatus) => { setSearch(""); setFieldStatus([s]); };
  const kpis = useMemo(() => {
    const total = stats?.total ?? 0;
    const naoAbordado = counts?.nao_abordado ?? 0;
    // Só dois quadrados: "Confirmados" e "Sem resposta" seguem acessíveis pelos chips de filtro.
    return [
      { label: isAdminLike ? "Meus captados" : "Meus contatos", v: total, onClick: () => clearFilters() },
      { label: "Ainda não abordados", v: naoAbordado, onClick: () => setOnlyStatus("nao_abordado") },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats?.total, counts?.nao_abordado, isAdminLike]);



  return (
    <div className="min-h-dvh bg-muted/20">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Agitação</h1>
        </div>

        {/* Faixa de impacto pessoal */}
        <ImpactBanner />

        {/* Atalho grande para as missões */}
        <MissionsShortcut />

        {/* KPIs — clicáveis, cada um aplica o filtro correspondente. */}
        <div className="grid grid-cols-2 gap-2 text-center">
          {kpis.map((k) => (
            <Kpi key={k.label} label={k.label} v={k.v} onClick={k.onClick} />
          ))}
        </div>


        {/* Busca */}
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone, cidade ou bairro" className="pl-9 h-11" />
        </div>

        {/* Filtros + classificação */}
        <details className="rounded-xl border bg-card group" open>
          <summary className="cursor-pointer list-none p-3 flex items-center justify-between select-none">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" /> Filtros
              {activeFilterCount > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px]">{activeFilterCount}</span>}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => { e.preventDefault(); clearFilters(); }}
                disabled={activeFilterCount === 0}
                className="text-[11px] inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-3 w-3" /> Limpar filtros
              </button>
              <span className="text-muted-foreground text-xs group-open:rotate-180 transition-transform">▾</span>
            </div>
          </summary>
          <div className="px-3 pb-3 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <FilterChip active={fieldStatus.includes("nao_abordado")} onClick={() => toggleStatus("nao_abordado")}>
                Ainda não abordado {counts && `(${counts.nao_abordado})`}
              </FilterChip>
              <FilterChip active={fieldStatus.includes("confirmado")} onClick={() => toggleStatus("confirmado")} tone="emerald">
                Confirmado {counts && `(${counts.confirmado})`}
              </FilterChip>
              <FilterChip active={fieldStatus.includes("sem_resposta")} onClick={() => toggleStatus("sem_resposta")} tone="amber">
                Sem resposta {counts && `(${counts.sem_resposta})`}
              </FilterChip>
              <FilterChip active={fieldStatus.includes("observacao")} onClick={() => toggleStatus("observacao")} tone="sky">
                Com observação {counts && `(${counts.observacao})`}
              </FilterChip>
              <FilterChip active={fieldStatus.includes("pediu_atualizacao")} onClick={() => toggleStatus("pediu_atualizacao")} tone="violet">
                Pediu atualização {counts && `(${counts.pediu_atualizacao})`}
              </FilterChip>
            </div>

            <div className="flex flex-wrap gap-3 items-center pt-1">
              <label className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                Classificação:
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} className="h-7 rounded border bg-background px-1.5 text-xs">
                  <option value="inclusion">Ordem de inclusão (padrão)</option>
                  <option value="alphabetical">Alfabética (por nome)</option>
                  <option value="recent">Mais recentes → mais antigos</option>
                  <option value="oldest">Mais antigos → mais recentes</option>
                  <option value="nao_abordado_first">Não abordados primeiro</option>
                </select>
              </label>
            </div>
          </div>
        </details>

        {filtersPaused && (
          <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-900 text-xs px-3 py-2">
            Mostrando resultado da busca <span className="opacity-70">(filtros de status pausados enquanto houver texto na busca)</span>
          </div>
        )}

        {/* Lista */}
        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
        {q.data && q.data.rows.length === 0 && (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum contato encontrado com esses filtros.
          </div>
        )}
        <div className="space-y-2">
          {(q.data?.rows ?? []).map((c) => {
            const la = c.last_action;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setDetailFor(c as AgitacaoContact)}
                className="w-full text-left rounded-xl border bg-card p-3 relative hover:border-primary/40 hover:bg-primary/5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setHistFor(c as AgitacaoContact); }}
                  aria-label="Ver histórico"
                  title="Ver histórico"
                  className="absolute top-2 right-2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <History className="h-4 w-4" />
                </button>

                <div className="min-w-0 pr-9">
                  <div className="font-medium truncate">{c.nome ?? "Sem nome"}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />{c.phone_e164 ?? c.phone_raw ?? "—"}
                  </div>
                  {(c.cidade || c.bairro) && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="h-3 w-3" />{[c.bairro, c.cidade, c.uf].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] items-center">
                    {la && (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${ACTION_TONE[la.action] ?? "bg-muted text-muted-foreground"}`}>
                        {ACTION_LABEL[la.action] ?? la.action} · {formatShortTime(la.created_at)}
                      </span>
                    )}
                    <Tag>{c.source_form_type === "cadastro_completo" ? "Cadastro completo" : "Recebe informações"}</Tag>
                    {c.lifecycle_status && <Tag>{c.lifecycle_status.replace(/_/g, " ")}</Tag>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {detailFor && (
        <AgitacaoDetailSheet
          contact={detailFor}
          onClose={() => setDetailFor(null)}
          onLog={(action, note) => logMut.mutateAsync({ contactId: detailFor.id, action, note })}
          pendingAction={pendingKey && pendingKey.startsWith(`${detailFor.id}:`) ? (pendingKey.split(":")[1] as AgitacaoAction) : null}
          onOpenHistory={() => setHistFor(detailFor)}
          waLink={waLink}
        />
      )}

      <TerritoryContactLogDrawer
        contact={histFor}
        open={!!histFor}
        onOpenChange={(o) => { if (!o) setHistFor(null); }}
        context="agitacao"
      />
    </div>
  );
}

function AgitacaoDetailSheet({
  contact, onClose, onLog, pendingAction, onOpenHistory, waLink,
}: {
  contact: AgitacaoContact;
  onClose: () => void;
  onLog: (action: AgitacaoAction, note?: string) => Promise<unknown>;
  pendingAction: AgitacaoAction | null;
  onOpenHistory: () => void;
  waLink: (e: string | null, r: string | null) => string;
}) {
  const [obsOpen, setObsOpen] = useState(false);
  const [obsText, setObsText] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const location = [contact.bairro, contact.cidade, contact.uf].filter(Boolean).join(" · ");
  const canWa = !!(contact.phone_e164 || contact.phone_raw);
  const isBusy = pendingAction !== null;

  async function saveObs() {
    const text = obsText.trim();
    if (!text) return;
    try {
      await onLog("observacao", text);
      setObsOpen(false);
      setObsText("");
    } catch { /* toast já tratado */ }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[1100] animate-in fade-in" onClick={onClose} aria-hidden />
      <aside className="fixed bottom-0 inset-x-0 z-[1101] w-full border-t bg-card overflow-hidden max-h-[85vh] rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom flex flex-col">
        <div className="flex justify-center pt-2 pb-1">
          <span className="block h-1.5 w-10 rounded-full bg-muted-foreground/40" />
        </div>

        <div className="px-4 pb-3 pt-1 border-b flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-base truncate">{contact.nome ?? "Sem nome"}</div>
            {location && <div className="text-xs text-muted-foreground truncate">{location}</div>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-muted shrink-0" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          {(contact.phone_e164 || contact.phone_raw) && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-mono">{contact.phone_e164 ?? contact.phone_raw}</span>
            </div>
          )}

          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ação de campo</div>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={canWa && !isBusy ? waLink(contact.phone_e164, contact.phone_raw) : undefined}
                onClick={(e) => {
                  if (!canWa || isBusy) { e.preventDefault(); return; }
                  onLog("whatsapp_aberto").catch(() => {});
                }}
                target="_blank" rel="noreferrer"
                aria-disabled={!canWa || isBusy}
                className={`h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium ${
                  canWa && !isBusy ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-muted text-muted-foreground pointer-events-none"
                }`}
              >
                {pendingAction === "whatsapp_aberto"
                  ? (<><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</>)
                  : (<><MessageCircle className="h-4 w-4" /> Abrir WhatsApp</>)}
              </a>
              <button
                disabled={isBusy}
                onClick={() => { onLog("contato_realizado").catch(() => {}); }}
                className="h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium border hover:bg-accent disabled:opacity-60 disabled:pointer-events-none"
              >
                {pendingAction === "contato_realizado"
                  ? (<><Loader2 className="h-4 w-4 animate-spin" /> Registrando…</>)
                  : (<><CheckCircle2 className="h-4 w-4" /> Confirmado</>)}
              </button>

              {!obsOpen ? (
                <button
                  disabled={isBusy}
                  onClick={() => setObsOpen(true)}
                  className="h-10 rounded-md inline-flex items-center justify-center gap-1.5 text-xs font-medium border hover:bg-accent col-span-2 disabled:opacity-60"
                >
                  <StickyNote className="h-3.5 w-3.5" /> Observação
                </button>
              ) : (
                <div className="col-span-2 space-y-2 rounded-md border bg-background p-2">
                  <textarea
                    autoFocus
                    value={obsText}
                    onChange={(e) => setObsText(e.target.value)}
                    maxLength={2000}
                    rows={3}
                    placeholder="Escreva o que aconteceu, o que combinou, dificuldades…"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => { setObsOpen(false); setObsText(""); }}
                      disabled={pendingAction === "observacao"}
                      className="h-9 px-3 rounded-md border text-xs disabled:opacity-60"
                    >
                      Cancelar
                    </button>
                    <button
                      disabled={!obsText.trim() || pendingAction === "observacao"}
                      onClick={saveObs}
                      className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50 inline-flex items-center gap-1.5"
                    >
                      {pendingAction === "observacao" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Salvar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t pt-3">
            <button
              type="button"
              onClick={onOpenHistory}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-md border hover:bg-muted"
            >
              <History className="h-3.5 w-3.5" /> Ver histórico
            </button>
            <Link
              to="/contatos/$id"
              params={{ id: contact.id }}
              className="text-xs inline-flex items-center gap-1 px-3 py-1.5 rounded-md border hover:bg-muted"
            >
              Abrir ficha completa <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

/** Retângulo roxo de destaque com o número de missões em aberto. */
function MissionsShortcut() {
  const listFn = useServerFn(listMyMissions);
  const q = useQuery({
    queryKey: ["my-missions"],
    queryFn: () => listFn(),
    staleTime: 60_000,
    retry: 1,
  });
  const open = (q.data?.missions ?? []).length;

  return (
    <Link
      to="/minhas-missoes"
      className="block w-full rounded-xl bg-[var(--purple-500)] px-4 py-4 text-left text-white shadow-punch transition hover:brightness-110"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-xl leading-none">Suas missões</div>
          <div className="mt-1 text-xs text-white/80">
            {q.isLoading
              ? "Carregando…"
              : open === 0
                ? "Nenhuma missão em aberto agora"
                : `${open} missão(ões) em aberto — toque para abrir`}
          </div>
        </div>
        <span className="font-display text-4xl leading-none">{open}</span>
      </div>
    </Link>
  );
}

function Kpi({ label, v, onClick }: { label: string; v: number; onClick?: () => void }) {
  const base = "rounded-lg border bg-card p-2 text-left transition-colors";
  const cls = onClick ? `${base} hover:border-primary/40 hover:bg-primary/5 cursor-pointer w-full` : base;
  const content = (
    <>
      <div className="text-lg font-semibold">{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>{content}</button>
  ) : (
    <div className={cls}>{content}</div>
  );
}

function FilterChip({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "emerald" | "amber" | "sky" | "violet" }) {
  const toneCls = active
    ? tone === "emerald" ? "bg-emerald-600 text-white border-emerald-600"
      : tone === "amber" ? "bg-amber-500 text-white border-amber-500"
      : tone === "sky" ? "bg-sky-600 text-white border-sky-600"
      : tone === "violet" ? "bg-violet-600 text-white border-violet-600"
      : "bg-primary text-primary-foreground border-primary"
    : "bg-background hover:bg-muted";
  return (
    <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded-full border text-xs ${toneCls}`}>
      {children}
    </button>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
      {children}
    </span>
  );
}

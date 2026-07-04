// Módulo Agitação — mobile-first, sem mapa.
// Cards de contatos captados pelo próprio usuário, com ações rápidas.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import {
  Zap, MessageCircle, CheckCircle2, StickyNote, Search, Loader2, Phone, MapPin, History,
  X, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { listMyAgitacaoContacts, logAgitacaoAction } from "@/lib/agitacao.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TerritoryContactLogDrawer } from "@/components/TerritoryContactLogDrawer";

export const Route = createFileRoute("/_authenticated/agitacao")({
  head: () => ({ meta: [{ title: "Agitação — Povo que Batalha" }] }),
  component: AgitacaoPage,
});

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
};

function AgitacaoPage() {
  const listFn = useServerFn(listMyAgitacaoContacts);
  const logFn = useServerFn(logAgitacaoAction);
  const [search, setSearch] = useState("");
  const [pendentes, setPendentes] = useState(false);
  const [semContato, setSemContato] = useState(false);
  const [obsFor, setObsFor] = useState<{ id: string; nome: string } | null>(null);
  const [obsText, setObsText] = useState("");
  const [histFor, setHistFor] = useState<AgitacaoContact | null>(null);
  const [detailFor, setDetailFor] = useState<AgitacaoContact | null>(null);

  const q = useQuery({
    queryKey: ["agitacao", search, pendentes, semContato],
    queryFn: () =>
      listFn({ data: { search: search || undefined, pendentes_atualizacao: pendentes, sem_contato_realizado: semContato, limit: 200 } }),
  });

  async function log(contactId: string, action: "whatsapp_aberto" | "contato_realizado" | "pediu_atualizacao" | "nao_respondeu", note?: string) {
    try {
      await logFn({ data: { contact_id: contactId, action, observacao: note ?? null } });
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar");
    }
  }

  async function saveObs() {
    if (!obsFor) return;
    try {
      await logFn({ data: { contact_id: obsFor.id, action: "observacao", observacao: obsText.trim() || null } });
      toast.success("Observação salva");
      setObsFor(null);
      setObsText("");
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  }

  function waLink(phoneE164: string | null, raw: string | null): string {
    const digits = (phoneE164 ?? raw ?? "").replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "#";
  }

  const stats = q.data?.stats;

  return (
    <div className="min-h-dvh bg-muted/20">
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Agitação</h1>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          <Kpi label="Captados" v={stats?.total ?? 0} />
          <Kpi label="Cadastros" v={stats?.cadastros_completos ?? 0} />
          <Kpi label="Inscrições" v={stats?.inscricoes ?? 0} />
          <Kpi label="Pendentes" v={stats?.pendentes_atualizacao ?? 0} />
          <Kpi label="Realizados" v={stats?.contatos_realizados ?? 0} />
          <Kpi label="Novos 7d" v={stats?.novos_7d ?? 0} />
        </div>

        {/* Busca + filtros */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome, telefone, cidade ou bairro" className="pl-9" />
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <Toggle active={pendentes} onClick={() => setPendentes(v => !v)}>Pendentes de atualização</Toggle>
            <Toggle active={semContato} onClick={() => setSemContato(v => !v)}>Sem contato realizado</Toggle>
          </div>
        </div>

        {/* Lista */}
        {q.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}
        {q.data && q.data.rows.length === 0 && (
          <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhum contato ainda. Use o botão <strong>Adicionar contato</strong> no topo para gerar um link e começar a captar.
          </div>
        )}
        <div className="space-y-2">
          {(q.data?.rows ?? []).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setDetailFor(c as AgitacaoContact)}
              className="w-full text-left rounded-xl border bg-card p-3 relative hover:border-primary/40 hover:bg-primary/5 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {/* Ícone histórico no canto */}
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
                <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                  <Tag>{c.source_form_type === "cadastro_completo" ? "Cadastro completo" : "Recebe informações"}</Tag>
                  {c.lifecycle_status && <Tag>{c.lifecycle_status.replace(/_/g, " ")}</Tag>}
                  {c.contato_realizado && <Tag ok>✓ realizado</Tag>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Painel de detalhe deslizando de baixo pra cima */}
      {detailFor && (
        <AgitacaoDetailSheet
          contact={detailFor}
          onClose={() => setDetailFor(null)}
          onLog={(action, note) => log(detailFor.id, action, note)}
          onOpenObs={() => { setObsFor({ id: detailFor.id, nome: detailFor.nome ?? "" }); setObsText(""); }}
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


      {obsFor && (
        <Dialog open onOpenChange={(v) => { if (!v) setObsFor(null); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Observação — {obsFor.nome}</DialogTitle></DialogHeader>
            <textarea
              className="w-full h-32 rounded-md border bg-background p-2 text-sm"
              value={obsText}
              onChange={(e) => setObsText(e.target.value)}
              placeholder="Escreva o que aconteceu, o que combinou, dificuldades…"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setObsFor(null)}>Cancelar</Button>
              <Button onClick={saveObs}>Salvar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function AgitacaoDetailSheet({
  contact, onClose, onLog, onOpenObs, onOpenHistory, waLink,
}: {
  contact: AgitacaoContact;
  onClose: () => void;
  onLog: (action: "whatsapp_aberto" | "contato_realizado" | "pediu_atualizacao" | "nao_respondeu", note?: string) => void | Promise<void>;
  onOpenObs: () => void;
  onOpenHistory: () => void;
  waLink: (e: string | null, r: string | null) => string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const location = [contact.bairro, contact.cidade, contact.uf].filter(Boolean).join(" · ");
  const canWa = !!(contact.phone_e164 || contact.phone_raw);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-[1100] animate-in fade-in"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed bottom-0 inset-x-0 z-[1101] w-full border-t bg-card overflow-hidden max-h-[85vh] rounded-t-2xl shadow-2xl animate-in slide-in-from-bottom flex flex-col"
      >
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
                href={canWa ? waLink(contact.phone_e164, contact.phone_raw) : undefined}
                onClick={() => { if (canWa) onLog("whatsapp_aberto"); }}
                target="_blank" rel="noreferrer"
                aria-disabled={!canWa}
                className={`h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium ${
                  canWa ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-muted text-muted-foreground pointer-events-none"
                }`}
              >
                <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
              </a>
              <button
                onClick={() => onLog("contato_realizado")}
                className="h-11 rounded-md inline-flex items-center justify-center gap-1.5 text-sm font-medium border hover:bg-accent"
              >
                <CheckCircle2 className="h-4 w-4" /> Confirmado
              </button>
              <button
                onClick={onOpenObs}
                className="h-10 rounded-md inline-flex items-center justify-center gap-1.5 text-xs font-medium border hover:bg-accent col-span-2"
              >
                <StickyNote className="h-3.5 w-3.5" /> Observação
              </button>
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

function Kpi({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="text-lg font-semibold">{v}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-2.5 py-1 rounded-full border ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
      {children}
    </button>
  );
}

function Tag({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded ${ok ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground"}`}>
      {children}
    </span>
  );
}

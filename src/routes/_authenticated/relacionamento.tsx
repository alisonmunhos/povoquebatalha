import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getRelacionamentoOverview, listMessageFilterOptions,
  listRecipientsByFilter, listCampaignSummaries, getCuratedList,
} from "@/lib/relacionamento.functions";
import {
  Heart, MessageSquareText, Send, RotateCw, Users2, AlertOctagon, Loader2,
  CheckCircle2, XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/relacionamento")({
  head: () => ({ meta: [{ title: "Relacionamento — VRM" }] }),
  component: Page,
});

type Tab = "visao" | "mensagem" | "campanha" | "recuperacao" | "engajados" | "problemas";

function Page() {
  const [tab, setTab] = useState<Tab>("visao");
  return (
    <div className="p-6 md:p-10 max-w-7xl">
      <header className="flex items-center gap-3 mb-2">
        <Heart className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Relacionamento</h1>
          <p className="text-sm text-muted-foreground">Acompanhe comportamento, mensagens, respostas, erros e reenvios.</p>
        </div>
      </header>

      <nav className="flex gap-1 border-b mt-6 mb-6 overflow-x-auto">
        {([
          ["visao", "Visão geral"],
          ["mensagem", "Por mensagem"],
          ["campanha", "Por campanha"],
          ["recuperacao", "Recuperação"],
          ["engajados", "Engajados"],
          ["problemas", "Opt-out / problemas"],
        ] as [Tab, string][]).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${
              tab === k ? "border-primary font-semibold text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>{label}</button>
        ))}
      </nav>

      {tab === "visao" && <TabVisao />}
      {tab === "mensagem" && <TabMensagem />}
      {tab === "campanha" && <TabCampanha />}
      {tab === "recuperacao" && <TabCurada kind="recuperacao" />}
      {tab === "engajados" && <TabCurada kind="engajados" />}
      {tab === "problemas" && <TabCurada kind="problemas" />}
    </div>
  );
}

function TabVisao() {
  const fn = useServerFn(getRelacionamentoOverview);
  const q = useQuery({ queryKey: ["rel-overview"], queryFn: () => fn() });
  const d = q.data;
  if (!d) return <div className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 inline animate-spin mr-2" />Carregando…</div>;
  const cards = [
    { icon: Users2, label: "Aptos para WhatsApp", value: d.aptos },
    { icon: Send, label: "Mensagens enviadas", value: d.enviados },
    { icon: MessageSquareText, label: "Respostas recebidas", value: d.respostas },
    { icon: AlertOctagon, label: "Erros de envio", value: d.erros },
    { icon: XCircle, label: "Opt-outs", value: d.optouts },
    { icon: Users2, label: "Sem resposta (aptos)", value: d.sem_resposta_aptos },
    { icon: RotateCw, label: "Recuperáveis (erros)", value: d.recuperaveis },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="border rounded-lg p-4 bg-card">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><c.icon className="h-4 w-4" />{c.label}</div>
            <div className="text-2xl font-bold mt-1">{c.value.toLocaleString("pt-BR")}</div>
          </div>
        ))}
      </div>
      {d.ultima_campanha && (
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-xs text-muted-foreground">Última campanha</div>
          <div className="font-medium mt-1">{(d.ultima_campanha as { nome: string }).nome}</div>
          <div className="text-xs text-muted-foreground">
            Status: {(d.ultima_campanha as { status: string }).status}
            {(d.ultima_campanha as { started_at?: string }).started_at && ` · Iniciada em ${new Date((d.ultima_campanha as { started_at: string }).started_at).toLocaleString("pt-BR")}`}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  queued: "Pendente", sending: "Enviando", sent: "Enviado (sem confirmação)",
  delivered: "Entregue", read: "Lido", failed: "Erro", canceled: "Cancelado", opted_out: "Saiu da lista",
};

function TabMensagem() {
  const optsFn = useServerFn(listMessageFilterOptions);
  const listFn = useServerFn(listRecipientsByFilter);
  const opts = useQuery({ queryKey: ["rel-msg-opts"], queryFn: () => optsFn() });
  const [templateId, setTemplateId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [responded, setResponded] = useState<"" | "sim" | "nao">("");
  const q = useQuery({
    queryKey: ["rel-msg", templateId, status, responded],
    queryFn: () => listFn({ data: {
      template_id: templateId || undefined,
      status: status ? [status] : undefined,
      responded: responded === "" ? undefined : responded === "sim",
    } }),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center border rounded-lg p-3 bg-muted/20">
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="text-sm border rounded px-2 py-1 bg-background">
          <option value="">Todas as mensagens salvas</option>
          {opts.data?.templates.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-sm border rounded px-2 py-1 bg-background">
          <option value="">Qualquer status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={responded} onChange={(e) => setResponded(e.target.value as "" | "sim" | "nao")} className="text-sm border rounded px-2 py-1 bg-background">
          <option value="">Respondeu (qualquer)</option>
          <option value="sim">Respondeu</option>
          <option value="nao">Não respondeu</option>
        </select>
        <div className="text-xs text-muted-foreground ml-auto">{q.data?.length ?? 0} resultado(s)</div>
      </div>
      <ResultTable rows={q.data ?? []} loading={q.isLoading} />
    </div>
  );
}

function TabCampanha() {
  const fn = useServerFn(listCampaignSummaries);
  const listFn = useServerFn(listRecipientsByFilter);
  const q = useQuery({ queryKey: ["rel-camps"], queryFn: () => fn() });
  const [campId, setCampId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const rq = useQuery({
    queryKey: ["rel-camp-recs", campId, status],
    queryFn: () => listFn({ data: { campaign_id: campId || undefined, status: status ? [status] : undefined } }),
    enabled: Boolean(campId),
  });
  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-2 border rounded-lg p-3 bg-muted/20">
        <select value={campId} onChange={(e) => setCampId(e.target.value)} className="text-sm border rounded px-2 py-1 bg-background">
          <option value="">Selecione uma campanha…</option>
          {q.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome} — {c.total_enviados}/{c.total_destinatarios} · {c.total_falhas} erros
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="text-sm border rounded px-2 py-1 bg-background">
          <option value="">Qualquer status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {campId && <ResultTable rows={rq.data ?? []} loading={rq.isLoading} />}
      {!campId && q.data && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase">
              <tr>
                <th className="p-2 text-left">Campanha</th>
                <th className="p-2">Total</th>
                <th className="p-2">Enviados</th>
                <th className="p-2">Entregues</th>
                <th className="p-2">Lidos</th>
                <th className="p-2">Erros</th>
                <th className="p-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="p-2">{c.nome}</td>
                  <td className="p-2 text-center">{c.total_destinatarios}</td>
                  <td className="p-2 text-center">{c.total_enviados}</td>
                  <td className="p-2 text-center">{c.total_entregues}</td>
                  <td className="p-2 text-center">{c.total_lidos}</td>
                  <td className="p-2 text-center text-destructive">{c.total_falhas}</td>
                  <td className="p-2"><Link to="/campanhas/$id" params={{ id: c.id }} className="text-primary hover:underline text-xs">Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type CuratedKind = "recuperacao" | "engajados" | "problemas";
const CURATED_MAP: Record<CuratedKind, Array<{ id: string; label: string }>> = {
  recuperacao: [
    { id: "erro_recente", label: "Deu erro em campanhas recentes" },
    { id: "sem_atualizacao", label: "Sem atualização de apoiador" },
    { id: "sem_resposta_longa", label: "Sem resposta há muito tempo" },
    { id: "consentimento_sem_campanha", label: "Consentimento ativo, aptos para reenvio" },
    { id: "aptos_reenvio", label: "Aptos para reenvio" },
  ],
  engajados: [
    { id: "responderam_recente", label: "Responderam recentemente (30 dias)" },
    { id: "formas_ajuda_marcadas", label: "Marcaram formas de ajuda" },
    { id: "panfletagem", label: "Quer panfletagem / banquinha" },
    { id: "adesivar_carro", label: "Quer adesivar carro" },
    { id: "plaquinha", label: "Quer plaquinha em casa" },
    { id: "receber_material", label: "Quer receber panfletos/adesivos" },
    { id: "movimento_social", label: "Participa de movimento social" },
  ],
  problemas: [
    { id: "opt_out", label: "Opt-outs" },
    { id: "bloqueados", label: "Bloqueados para envio" },
    { id: "telefone_invalido", label: "Telefone inválido" },
    { id: "arquivados", label: "Arquivados" },
    { id: "sem_consentimento", label: "Sem consentimento" },
  ],
};

function TabCurada({ kind }: { kind: CuratedKind }) {
  const fn = useServerFn(getCuratedList);
  const opts = CURATED_MAP[kind];
  const [sel, setSel] = useState<string>(opts[0].id);
  const q = useQuery({
    queryKey: ["rel-curated", sel],
    queryFn: () => fn({ data: { kind: sel as never } }),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {opts.map((o) => (
          <button key={o.id} onClick={() => setSel(o.id)}
            className={`text-xs px-3 py-1.5 rounded-full border ${sel === o.id ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
            {o.label}
          </button>
        ))}
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="p-2 text-left">Nome</th>
              <th className="p-2 text-left">Telefone</th>
              <th className="p-2 text-left">Cidade/UF</th>
              <th className="p-2 text-left">Bairro</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {q.isLoading && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground"><Loader2 className="h-4 w-4 inline animate-spin" /></td></tr>}
            {q.data?.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nenhum contato.</td></tr>}
            {q.data?.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.nome ?? "—"}</td>
                <td className="p-2 font-mono text-xs">{r.phone_e164 ?? "—"}</td>
                <td className="p-2">{r.cidade ? `${r.cidade}/${r.uf ?? ""}` : "—"}</td>
                <td className="p-2">{r.bairro ?? "—"}</td>
                <td className="p-2 text-right"><Link to="/contatos/$id" params={{ id: r.id }} className="text-primary hover:underline text-xs">Abrir</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {q.data?.length ?? 0} resultado(s). Para enviar em massa, abra <Link to="/contatos" className="underline">Gestão da Base</Link> e reproduza os filtros para acionar o envio via wizard.
      </p>
    </div>
  );
}

function ResultTable({ rows, loading }: { rows: Array<{
  id: string; contact_id: string | null; nome: string | null; phone: string | null;
  cidade: string | null; bairro: string | null; uf: string | null; status: string;
  sent_at: string | null; campaign_name: string | null; respondeu: boolean; erro: string | null;
}>; loading: boolean }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase">
          <tr>
            <th className="p-2 text-left">Contato</th>
            <th className="p-2 text-left">WhatsApp</th>
            <th className="p-2 text-left">Cidade</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Campanha</th>
            <th className="p-2 text-left">Envio</th>
            <th className="p-2 text-left">Resp.</th>
            <th className="p-2"></th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground"><Loader2 className="h-4 w-4 inline animate-spin" /></td></tr>}
          {!loading && rows.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum resultado.</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td className="p-2">{r.nome ?? "—"}</td>
              <td className="p-2 font-mono text-xs">{r.phone ?? "—"}</td>
              <td className="p-2">{r.cidade ? `${r.cidade}/${r.uf ?? ""}` : "—"}</td>
              <td className="p-2"><StatusBadge status={r.status} /></td>
              <td className="p-2 truncate max-w-[16rem]">{r.campaign_name ?? "—"}</td>
              <td className="p-2 text-xs text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleString("pt-BR") : "—"}</td>
              <td className="p-2">{r.respondeu ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <span className="text-muted-foreground">—</span>}</td>
              <td className="p-2 text-right">{r.contact_id && <Link to="/contatos/$id" params={{ id: r.contact_id }} className="text-primary hover:underline text-xs">Abrir</Link>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const color = status === "failed" ? "bg-destructive/10 text-destructive" :
    status === "read" ? "bg-green-100 text-green-800" :
    status === "delivered" ? "bg-blue-100 text-blue-800" :
    status === "canceled" ? "bg-muted text-muted-foreground" :
    "bg-muted";
  return <span className={`inline-block text-xs px-2 py-0.5 rounded ${color}`}>{label}</span>;
}

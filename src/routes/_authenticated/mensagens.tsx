import { createFileRoute } from "@tanstack/react-router";
import { CommunicationTabs } from "@/components/CommunicationTabs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listMessageTemplates, upsertMessageTemplate, archiveMessageTemplate,
  duplicateMessageTemplate, sendTestTemplate,
  listAutomations, upsertAutomation, deleteAutomation, listRecentAutomationDeliveries,
  retryAutomationDelivery, triggerAutomationForContact,
} from "@/lib/messages.functions";
import { MessageSquareText, Zap, Reply, Save, Copy, Archive, Send, Plus, Trash2, Loader2, RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import { MessageComposer, COMPOSER_VARIABLES, type ComposerValue } from "@/components/MessageComposer";

export const Route = createFileRoute("/_authenticated/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens e automações" }] }),
  component: MensagensPage,
});

type Tpl = {
  id: string; kind: "system" | "quick_reply"; event_key: string | null; shortcut: string | null;
  title: string; category: string | null; body: string; variables: unknown;
  link: string | null; media_url: string | null;
  media_path: string | null; media_mime: string | null; media_filename: string | null;
  active: boolean; updated_at: string;
};

const SYSTEM_EVENTS = [
  { value: "atualizacao_apoiador_concluida", label: "Atualização de apoiador concluída" },
  { value: "inscricao_concluida", label: "Inscrição simples concluída" },
];

const CATEGORIAS_QR = [
  "atualizacao_apoiadores", "divulgacao", "organizacao_interna",
  "evento", "mobilizacao_rua", "duvida_frequente", "salvar_contato", "boas_vindas",
];

const VARIAVEIS = [...COMPOSER_VARIABLES];

function MensagensPage() {
  const [tab, setTab] = useState<"system" | "quick_reply" | "automations">("system");
  return (
    <div className="p-6 md:p-10 max-w-6xl">
    <div className="-mx-6 md:-mx-10 -mt-6 md:-mt-10 mb-6"><CommunicationTabs /></div>
      
      <header className="flex items-center gap-3 mb-6">
        <MessageSquareText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Mensagens e automações</h1>
          <p className="text-sm text-muted-foreground">
            Mensagens salvas são modelos reutilizáveis. Elas não são enviadas sozinhas, exceto quando vinculadas a uma automação. Use-as ao criar uma campanha.
          </p>
        </div>
      </header>
      <div className="border-b mb-4 flex gap-1">
        <TabBtn active={tab === "system"} onClick={() => setTab("system")} icon={<Zap className="h-4 w-4" />}>Mensagens do sistema</TabBtn>
        <TabBtn active={tab === "quick_reply"} onClick={() => setTab("quick_reply")} icon={<Reply className="h-4 w-4" />}>Respostas prontas</TabBtn>
        <TabBtn active={tab === "automations"} onClick={() => setTab("automations")} icon={<Send className="h-4 w-4" />}>Automações</TabBtn>
      </div>
      {tab === "system" && <TemplatesList kind="system" />}
      {tab === "quick_reply" && <TemplatesList kind="quick_reply" />}
      {tab === "automations" && <AutomationsPanel />}
    </div>
  );
}

function TabBtn({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 px-4 py-2 text-sm border-b-2 -mb-px transition ${active ? "border-primary text-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {icon} {children}
    </button>
  );
}

function TemplatesList({ kind }: { kind: "system" | "quick_reply" }) {
  const listFn = useServerFn(listMessageTemplates);
  const upsertFn = useServerFn(upsertMessageTemplate);
  const archiveFn = useServerFn(archiveMessageTemplate);
  const dupFn = useServerFn(duplicateMessageTemplate);
  const testFn = useServerFn(sendTestTemplate);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["message-templates"], queryFn: () => listFn() });
  const [editing, setEditing] = useState<Partial<Tpl> | null>(null);

  const list = (q.data ?? []).filter((t) => t.kind === kind);

  function newTpl() {
    setEditing({ kind, active: true, variables: VARIAVEIS });
  }

  const [testPhone, setTestPhone] = useState("");


  async function save() {
    if (!editing?.title || !editing.body) return toast.error("Título e mensagem são obrigatórios");
    try {
      await upsertFn({ data: {
        id: editing.id,
        kind,
        event_key: (editing.event_key as string | null) ?? null,
        shortcut: (editing.shortcut as string | null) ?? null,
        title: editing.title as string,
        category: (editing.category as string | null) ?? null,
        body: editing.body as string,
        variables: Array.isArray(editing.variables) ? editing.variables as string[] : VARIAVEIS,
        link: (editing.link as string | null) ?? null,
        media_url: (editing.media_url as string | null) ?? null,
        media_path: (editing.media_path as string | null) ?? null,
        media_mime: (editing.media_mime as string | null) ?? null,
        media_filename: (editing.media_filename as string | null) ?? null,
        active: editing.active ?? true,
      }});
      toast.success("Salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["message-templates"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function onArchive(id: string) {
    if (!confirm("Arquivar esta mensagem?")) return;
    await archiveFn({ data: { id } });
    toast.success("Arquivado");
    qc.invalidateQueries({ queryKey: ["message-templates"] });
  }
  async function onDup(id: string) {
    await dupFn({ data: { id } });
    toast.success("Duplicado");
    qc.invalidateQueries({ queryKey: ["message-templates"] });
  }
  async function onTest(id: string) {
    const phone = testPhone.trim();
    if (!phone) return toast.error("Informe um WhatsApp de teste (com DDD)");
    try {
      await testFn({ data: { templateId: id, phone } });
      toast.success(`Teste enviado para ${phone}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  }

  async function onAttach(file: File) {
    if (!editing) return;
    if (file.size > 8 * 1024 * 1024) return toast.error("Arquivo acima de 8MB");
    setUploading(true);
    try {
      const sig = await signUpload({ data: { filename: file.name, contentType: file.type } });
      const up = await fetch(sig.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": sig.contentType, "x-upsert": "true" },
        body: file,
      });
      if (!up.ok) throw new Error(`Falha upload (${up.status})`);
      setEditing({ ...editing, media_path: sig.path, media_mime: sig.contentType, media_filename: sig.filename });
      toast.success("Anexo carregado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro upload");
    } finally { setUploading(false); }
  }

  return (
    <div className="grid md:grid-cols-[380px_1fr] gap-4">
      <aside className="border rounded-xl bg-card">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-medium">{list.length} mensagens</span>
          <button onClick={newTpl} className="inline-flex items-center gap-1 text-xs rounded-md bg-primary text-primary-foreground px-3 py-1.5">
            <Plus className="h-3.5 w-3.5" /> Nova
          </button>
        </div>
        <ul className="divide-y max-h-[70vh] overflow-y-auto">
          {q.isLoading && <li className="p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /> carregando…</li>}
          {list.map((t) => (
            <li key={t.id}>
              <button onClick={() => setEditing(t as Partial<Tpl>)} className={`w-full text-left p-3 hover:bg-muted/40 ${editing?.id === t.id ? "bg-muted/60" : ""}`}>
                <div className="text-sm font-medium truncate">{t.title}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {kind === "system" ? (t.event_key ?? "sem evento") : (t.shortcut ?? "sem atalho")}
                  {!t.active && " · inativo"}
                </div>
              </button>
            </li>
          ))}
          {!q.isLoading && list.length === 0 && (
            <li className="p-4 text-sm text-muted-foreground">Nenhuma mensagem. Crie a primeira.</li>
          )}
        </ul>
      </aside>

      <section className="border rounded-xl bg-card p-5">
        {!editing && <p className="text-sm text-muted-foreground">Selecione uma mensagem à esquerda ou crie uma nova.</p>}
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium">Título interno</label>
                <input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
              </div>
              {kind === "system" ? (
                <div>
                  <label className="text-xs font-medium">Evento associado</label>
                  <select value={editing.event_key ?? ""} onChange={(e) => setEditing({ ...editing, event_key: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background">
                    <option value="">— nenhum —</option>
                    {SYSTEM_EVENTS.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium">Atalho</label>
                  <input value={editing.shortcut ?? ""} onChange={(e) => setEditing({ ...editing, shortcut: e.target.value })} placeholder="/agenda" className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
                </div>
              )}
              <div>
                <label className="text-xs font-medium">Categoria</label>
                {kind === "quick_reply" ? (
                  <select value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background">
                    <option value="">—</option>
                    {CATEGORIAS_QR.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                  </select>
                ) : (
                  <input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
                )}
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium">Mensagem</label>
                <textarea value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={9} className="mt-1 w-full rounded-md border px-3 py-2 text-sm font-mono bg-background" />
                <div className="mt-1 text-xs text-muted-foreground">
                  Variáveis: {VARIAVEIS.map((v) => `{{${v}}}`).join(" · ")}
                </div>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-medium">Link (aparece com prévia no WhatsApp)</label>
                <input
                  value={editing.link ?? ""}
                  onChange={(e) => setEditing({ ...editing, link: e.target.value })}
                  placeholder="https://instagram.com/p/..."
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background"
                />
                <p className="text-[10px] text-muted-foreground mt-1">Se o link estiver no corpo da mensagem, o WhatsApp gera automaticamente a prévia da postagem.</p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-xs font-medium">Anexo (imagem ou PDF, até 8MB)</label>
                {editing.media_path ? (
                  <div className="mt-1 flex items-center gap-2 rounded-md border px-3 py-2 text-xs bg-muted/30">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span className="flex-1 truncate">{editing.media_filename ?? editing.media_path}</span>
                    <button
                      onClick={() => setEditing({ ...editing, media_path: null, media_mime: null, media_filename: null })}
                      className="text-destructive hover:underline"
                    ><X className="h-3.5 w-3.5" /></button>
                  </div>
                ) : (
                  <label className="mt-1 flex items-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs cursor-pointer hover:bg-muted/40">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                    <span>{uploading ? "Enviando…" : "Escolher arquivo"}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) onAttach(f); }}
                    />
                  </label>
                )}
              </div>
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                Ativa
              </label>

              <div className="col-span-2 border rounded-md bg-[#e5ddd5] p-4">
                <div className="text-[10px] font-medium text-muted-foreground uppercase mb-2">Pré-visualização (como o contato verá)</div>
                <WhatsappPreview body={editing.body ?? ""} link={editing.link ?? null} mediaMime={editing.media_mime ?? null} mediaFilename={editing.media_filename ?? null} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <button onClick={save} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">
                <Save className="h-4 w-4" /> Salvar
              </button>
              {editing.id && (
                <>
                  <div className="flex items-center gap-1 border rounded-md px-2 py-1">
                    <span className="text-[10px] text-muted-foreground">Teste:</span>
                    <input
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                      placeholder="(11) 9…"
                      className="w-32 text-xs bg-transparent outline-none"
                    />
                    <button onClick={() => onTest(editing.id!)} className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-2 py-1 text-xs hover:bg-primary/20">
                      <Send className="h-3 w-3" /> Enviar teste
                    </button>
                  </div>
                  <button onClick={() => onDup(editing.id!)} className="inline-flex items-center gap-1 rounded-md border px-4 py-2 text-sm hover:bg-muted">
                    <Copy className="h-4 w-4" /> Duplicar
                  </button>
                  <button onClick={() => onArchive(editing.id!)} className="inline-flex items-center gap-1 rounded-md border border-destructive/40 text-destructive px-4 py-2 text-sm hover:bg-destructive/10">
                    <Archive className="h-4 w-4" /> Arquivar
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

type Automation = {
  id: string; event_key: string; template_id: string; active: boolean;
  delay_seconds: number; require_consent: boolean; notes: string | null;
  template?: { title: string; kind: string } | null;
};

function AutomationsPanel() {
  const listFn = useServerFn(listAutomations);
  const tplFn = useServerFn(listMessageTemplates);
  const upsertFn = useServerFn(upsertAutomation);
  const delFn = useServerFn(deleteAutomation);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["automations"], queryFn: () => listFn() });
  const tpls = useQuery({ queryKey: ["message-templates"], queryFn: () => tplFn() });
  const deliveriesFn = useServerFn(listRecentAutomationDeliveries);
  const deliveries = useQuery({
    queryKey: ["automation-deliveries-recent"],
    queryFn: () => deliveriesFn({ data: { limit: 30 } }),
    refetchInterval: 15_000,
  });
  const systemTpls = (tpls.data ?? []).filter((t) => t.kind === "system" && t.active);

  const [editing, setEditing] = useState<Partial<Automation> | null>(null);

  const toggle = useMutation({
    mutationFn: async (a: Automation) => upsertFn({ data: {
      id: a.id, event_key: a.event_key, template_id: a.template_id,
      active: !a.active, delay_seconds: a.delay_seconds, require_consent: a.require_consent, notes: a.notes,
    }}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["automations"] }),
  });

  async function save() {
    if (!editing?.event_key || !editing.template_id) return toast.error("Evento e mensagem são obrigatórios");
    await upsertFn({ data: {
      id: editing.id,
      event_key: editing.event_key,
      template_id: editing.template_id,
      active: editing.active ?? false,
      delay_seconds: editing.delay_seconds ?? 0,
      require_consent: editing.require_consent ?? true,
      notes: editing.notes ?? null,
    }});
    toast.success("Automação salva");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["automations"] });
  }
  async function onDelete(id: string) {
    if (!confirm("Excluir automação?")) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["automations"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">Regras que enviam mensagens automáticas quando algo acontece.</p>
        <button onClick={() => setEditing({ active: false, require_consent: true, delay_seconds: 0 })} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm">
          <Plus className="h-4 w-4" /> Nova automação
        </button>
      </div>

      <div className="border rounded-xl bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2">Evento</th>
              <th className="text-left px-4 py-2">Mensagem</th>
              <th className="text-left px-4 py-2">Consentimento</th>
              <th className="text-left px-4 py-2">Delay</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((a) => {
              const row = a as Automation;
              return (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-2 font-mono text-xs">{row.event_key}</td>
                  <td className="px-4 py-2">{row.template?.title ?? "—"}</td>
                  <td className="px-4 py-2">{row.require_consent ? "Sim" : "Não"}</td>
                  <td className="px-4 py-2">{row.delay_seconds}s</td>
                  <td className="px-4 py-2">
                    <button onClick={() => toggle.mutate(row)} className={`text-xs px-2 py-1 rounded ${row.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                      {row.active ? "Ativa" : "Inativa"}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => setEditing(row)} className="text-xs text-primary hover:underline mr-3">Editar</button>
                    <button onClick={() => onDelete(row.id)} className="text-xs text-destructive hover:underline"><Trash2 className="h-3 w-3 inline" /></button>
                  </td>
                </tr>
              );
            })}
            {(q.data ?? []).length === 0 && !q.isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">Nenhuma automação cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border rounded-xl bg-card">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">Últimas entregas</h2>
            <p className="text-xs text-muted-foreground">Registro das mensagens automáticas disparadas — útil para checar se a confirmação de cadastro está saindo.</p>
          </div>
          <div className="flex items-center gap-2">
            <ManualTrigger onDone={() => qc.invalidateQueries({ queryKey: ["automation-deliveries-recent"] })} />
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ["automation-deliveries-recent"] })}
              className="text-xs rounded border px-2 py-1 hover:bg-muted"
            >Atualizar</button>
          </div>
        </div>
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase sticky top-0">
              <tr>
                <th className="text-left px-4 py-2">Quando</th>
                <th className="text-left px-4 py-2">Contato</th>
                <th className="text-left px-4 py-2">Evento</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Detalhe</th>
                <th className="text-left px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(deliveries.data ?? []).map((d) => {
                const row = d as {
                  id: string; status: string; error: string | null; sent_at: string | null; created_at: string;
                  contact?: { nome: string | null; phone_e164: string | null } | null;
                  automation?: { event_key: string } | null;
                };
                const when = new Date(row.sent_at ?? row.created_at).toLocaleString("pt-BR");
                const color = row.status === "sent" ? "bg-emerald-100 text-emerald-700"
                  : row.status === "error" ? "bg-red-100 text-red-700"
                  : "bg-slate-200 text-slate-600";
                const canRetry = row.status !== "sent";
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2 whitespace-nowrap text-xs">{when}</td>
                    <td className="px-4 py-2">{row.contact?.nome ?? "—"} <span className="text-xs text-muted-foreground">{row.contact?.phone_e164 ?? ""}</span></td>
                    <td className="px-4 py-2 font-mono text-xs">{row.automation?.event_key ?? "—"}</td>
                    <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded ${color}`}>{row.status}</span></td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{row.error ?? ""}</td>
                    <td className="px-4 py-2 text-right">
                      {canRetry && <RetryButton id={row.id} onDone={() => qc.invalidateQueries({ queryKey: ["automation-deliveries-recent"] })} />}
                    </td>
                  </tr>
                );
              })}
              {(deliveries.data ?? []).length === 0 && !deliveries.isLoading && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground text-sm">Nenhuma entrega ainda. Faça uma atualização cadastral de teste para conferir.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {editing && (
        <div className="border rounded-xl bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Editar automação</h2>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Evento</label>
              <select value={editing.event_key ?? ""} onChange={(e) => setEditing({ ...editing, event_key: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background">
                <option value="">—</option>
                {SYSTEM_EVENTS.map((ev) => <option key={ev.value} value={ev.value}>{ev.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Mensagem do sistema</label>
              <select value={editing.template_id ?? ""} onChange={(e) => setEditing({ ...editing, template_id: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background">
                <option value="">—</option>
                {systemTpls.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Delay (segundos)</label>
              <input type="number" min={0} value={editing.delay_seconds ?? 0} onChange={(e) => setEditing({ ...editing, delay_seconds: Number(e.target.value) })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
              <p className="text-[10px] text-muted-foreground mt-1">Nesta versão o envio é imediato após o evento — este campo será respeitado quando a fila com delay for ativada.</p>
            </div>
            <label className="flex items-center gap-2 text-sm mt-6">
              <input type="checkbox" checked={editing.require_consent ?? true} onChange={(e) => setEditing({ ...editing, require_consent: e.target.checked })} />
              Só enviar com consentimento WhatsApp
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editing.active ?? false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Ativa
            </label>
            <div className="md:col-span-2">
              <label className="text-xs font-medium">Notas (opcional)</label>
              <textarea value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} rows={2} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">
              <Save className="h-4 w-4" /> Salvar
            </button>
            <button onClick={() => setEditing(null)} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============= Pré-visualização estilo WhatsApp =============
function WhatsappPreview({ body, link, mediaMime, mediaFilename }: {
  body: string; link: string | null; mediaMime: string | null; mediaFilename: string | null;
}) {
  // Substitui variáveis por exemplos amigáveis
  let rendered = (body || "")
    .replace(/\{\{\s*nome\s*\}\}/gi, "Marina")
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, "Marina")
    .replace(/\{\{\s*cidade\s*\}\}/gi, "Curitiba")
    .replace(/\{\{\s*bairro\s*\}\}/gi, "Centro")
    .replace(/\{\{\s*link_atualizacao\s*\}\}/gi, "https://povoquebatalha.lovable.app/recadastro?t=exemplo")
    .replace(/\{\{\s*link_inscricao\s*\}\}/gi, "https://povoquebatalha.lovable.app/inscrever");

  // Anexa o link do campo (se ainda não estiver no corpo) — mesmo comportamento do envio real
  if (link && !rendered.includes(link)) {
    rendered = `${rendered}\n\n${link}`.trim();
  }

  // Detecta primeiro link no corpo para mostrar cartão de prévia
  const urlMatch = rendered.match(/https?:\/\/[^\s]+/);
  const previewUrl = link || (urlMatch ? urlMatch[0] : null);
  const host = previewUrl ? (() => { try { return new URL(previewUrl).hostname.replace("www.", ""); } catch { return null; } })() : null;

  // Formatação básica *negrito* e _itálico_
  const html = rendered
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*(.+?)\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/(https?:\/\/[^\s]+)/g, '<a class="text-sky-700 underline break-all" href="$1" target="_blank" rel="noopener">$1</a>')
    .replace(/\n/g, "<br/>");

  return (
    <div className="max-w-sm ml-auto">
      <div className="rounded-lg bg-[#dcf8c6] shadow-sm p-2 text-[13px] text-slate-800">
        {mediaMime && mediaMime.startsWith("image/") && (
          <div className="mb-2 aspect-video rounded bg-slate-300/60 flex items-center justify-center text-[11px] text-slate-600">
            🖼️ {mediaFilename ?? "imagem anexada"}
          </div>
        )}
        {mediaMime === "application/pdf" && (
          <div className="mb-2 rounded border border-slate-300 bg-white/60 p-2 text-[11px] text-slate-700 flex items-center gap-2">
            📄 {mediaFilename ?? "documento.pdf"}
          </div>
        )}
        {host && (
          <div className="mb-2 rounded-md overflow-hidden border border-black/5 bg-white/70">
            <div className="aspect-video bg-slate-200 flex items-center justify-center text-[10px] text-slate-500">
              Prévia gerada pelo WhatsApp
            </div>
            <div className="px-2 py-1.5">
              <div className="text-[11px] font-medium truncate">{host}</div>
              <div className="text-[10px] text-slate-500 truncate">{previewUrl}</div>
            </div>
          </div>
        )}
        <div dangerouslySetInnerHTML={{ __html: html || "<span class='text-slate-400'>(mensagem vazia)</span>" }} />
        <div className="text-[10px] text-slate-500 text-right mt-1">agora ✓✓</div>
      </div>
    </div>
  );
}

function RetryButton({ id, onDone }: { id: string; onDone: () => void }) {
  const retryFn = useServerFn(retryAutomationDelivery);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await retryFn({ data: { deliveryId: id } });
      toast.success("Reenviado");
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(false); }
  }
  return (
    <button onClick={run} disabled={busy} className="inline-flex items-center gap-1 text-xs rounded border px-2 py-0.5 hover:bg-muted disabled:opacity-50">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Reenviar
    </button>
  );
}

function ManualTrigger({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(triggerAutomationForContact);
  const [open, setOpen] = useState(false);
  const [eventKey, setEventKey] = useState("atualizacao_apoiador_concluida");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    if (!query.trim()) return toast.error("Informe telefone, nome ou id");
    setBusy(true);
    try {
      const r = await fn({ data: { eventKey, contactQuery: query.trim() } });
      toast.success(`Disparado para ${r.nome ?? r.contact_id}`);
      setOpen(false); setQuery("");
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(false); }
  }
  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs rounded border px-2 py-1 hover:bg-muted">
      Disparar por contato
    </button>
  );
  return (
    <div className="flex items-center gap-1 border rounded-md px-2 py-1 bg-muted/30">
      <select value={eventKey} onChange={(e) => setEventKey(e.target.value)} className="text-xs bg-transparent outline-none">
        <option value="atualizacao_apoiador_concluida">Atualização concluída</option>
        <option value="inscricao_concluida">Inscrição concluída</option>
      </select>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="nome, telefone ou id" className="w-40 text-xs bg-transparent outline-none" />
      <button onClick={run} disabled={busy} className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-2 py-0.5 text-xs hover:bg-primary/20 disabled:opacity-50">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Disparar
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">×</button>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  listMessageTemplates, upsertMessageTemplate, archiveMessageTemplate,
  duplicateMessageTemplate, sendTestTemplate,
  listAutomations, upsertAutomation, deleteAutomation,
} from "@/lib/messages.functions";
import { MessageSquareText, Zap, Reply, Save, Copy, Archive, Send, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/mensagens")({
  head: () => ({ meta: [{ title: "Mensagens e automações" }] }),
  component: MensagensPage,
});

type Tpl = {
  id: string; kind: "system" | "quick_reply"; event_key: string | null; shortcut: string | null;
  title: string; category: string | null; body: string; variables: unknown;
  link: string | null; media_url: string | null; active: boolean; updated_at: string;
};

const SYSTEM_EVENTS = [
  { value: "atualizacao_apoiador_concluida", label: "Atualização de apoiador concluída" },
  { value: "inscricao_concluida", label: "Inscrição simples concluída" },
];

const CATEGORIAS_QR = [
  "atualizacao_apoiadores", "divulgacao", "organizacao_interna",
  "evento", "mobilizacao_rua", "duvida_frequente", "salvar_contato", "boas_vindas",
];

const VARIAVEIS = ["nome", "primeiro_nome", "cidade", "bairro", "link_atualizacao", "link_inscricao"];

function MensagensPage() {
  const [tab, setTab] = useState<"system" | "quick_reply" | "automations">("system");
  return (
    <div className="p-6 md:p-10 max-w-6xl">
      <header className="flex items-center gap-3 mb-6">
        <MessageSquareText className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Mensagens e automações</h1>
          <p className="text-sm text-muted-foreground">
            Edite as mensagens automáticas, respostas rápidas e regras de envio da campanha.
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
    const phone = prompt("Enviar teste para qual WhatsApp? (com DDD)");
    if (!phone) return;
    try {
      await testFn({ data: { templateId: id, phone } });
      toast.success("Teste enviado");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
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
              {kind === "quick_reply" && (
                <>
                  <div>
                    <label className="text-xs font-medium">Link (opcional)</label>
                    <input value={editing.link ?? ""} onChange={(e) => setEditing({ ...editing, link: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
                  </div>
                  <div>
                    <label className="text-xs font-medium">Mídia (URL)</label>
                    <input value={editing.media_url ?? ""} onChange={(e) => setEditing({ ...editing, media_url: e.target.value })} className="mt-1 w-full rounded-md border px-3 py-2 text-sm bg-background" />
                  </div>
                </>
              )}
              <label className="col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
                Ativa
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <button onClick={save} className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm">
                <Save className="h-4 w-4" /> Salvar
              </button>
              {editing.id && (
                <>
                  <button onClick={() => onTest(editing.id!)} className="inline-flex items-center gap-1 rounded-md border px-4 py-2 text-sm hover:bg-muted">
                    <Send className="h-4 w-4" /> Enviar teste
                  </button>
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

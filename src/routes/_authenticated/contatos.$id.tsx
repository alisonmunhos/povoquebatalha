import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import {
  getContact, updateContact, archiveContact, setOptOut,
  getContactHistory, listAllTags, createTag, setContactTag,
} from "@/lib/contacts.functions";
import { parsePhoneBR, formatPhoneBR } from "@/lib/phone";
import { useCepLookup, formatCep } from "@/hooks/use-cep";
import { ArrowLeft, Loader2, Save, Archive, ArchiveRestore, UserMinus, UserCheck, Plus, X, Copy, MessageCircle, History, Tag as TagIcon } from "lucide-react";
import { toast } from "sonner";

const TIPO_OPTIONS = [
  { v: "apoiador", l: "Apoiador" }, { v: "voluntario", l: "Voluntário" },
  { v: "lista_divulgacao", l: "Lista de divulgação" }, { v: "importado", l: "Importado" },
  { v: "outro", l: "Outro" },
] as const;

const FORMAS_AJUDA = [
  { v: "panfletagem_banquinha", l: "Panfletagem / Banquinha" },
  { v: "panfletagem", l: "Panfletagem (legado)" },
  { v: "compartilhar_whatsapp", l: "Compartilhar material no WhatsApp" },
  { v: "compartilhar_redes", l: "Compartilhar nas redes sociais" },
  { v: "participar_eventos", l: "Participar de eventos" },
  { v: "ajudar_organizacao", l: "Ajudar na organização" },
  { v: "mobilizar_bairro", l: "Mobilizar pessoas do bairro" },
  { v: "adesivar_carro", l: "Adesivar o carro" },
  { v: "plaquinha_casa", l: "Plaquinha na frente de casa" },
  { v: "receber_panfletos", l: "Receber panfletos e adesivos" },
  { v: "outro", l: "Outro" },
];

export const Route = createFileRoute("/_authenticated/contatos/$id")({
  head: () => ({ meta: [{ title: "Ficha do contato" }] }),
  component: ContatoFicha,
});

function ContatoFicha() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getContact);
  const updateFn = useServerFn(updateContact);
  const archiveFn = useServerFn(archiveContact);
  const optOutFn = useServerFn(setOptOut);
  const historyFn = useServerFn(getContactHistory);
  const tagsFn = useServerFn(listAllTags);
  const createTagFn = useServerFn(createTag);
  const setTagFn = useServerFn(setContactTag);

  const q = useQuery({ queryKey: ["contact", id], queryFn: () => getFn({ data: { id } }) });
  const hist = useQuery({ queryKey: ["contact-history", id], queryFn: () => historyFn({ data: { id } }) });
  const allTags = useQuery({ queryKey: ["tags"], queryFn: () => tagsFn() });

  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const cepHook = useCepLookup();

  useEffect(() => {
    if (q.data?.contact) {
      const c = q.data.contact;
      setForm({
        nome: c.nome ?? "", nome_social: c.nome_social ?? "", email: c.email ?? "",
        phone_raw: c.phone_raw ?? c.phone_e164 ?? "",
        cep: c.cep ? formatCep(c.cep) : "", endereco: c.endereco ?? "", numero: c.numero ?? "",
        complemento: c.complemento ?? "", referencia: c.referencia ?? "",
        bairro: c.bairro ?? "", cidade: c.cidade ?? "", uf: c.uf ?? "",
        profissao: c.profissao ?? "", coletivo_alicerce: c.coletivo_alicerce ?? false,
        participa_movimento_social: c.participa_movimento_social ?? false,
        movimento_social_nome: c.movimento_social_nome ?? "",
        tipo_contato: c.tipo_contato ?? "apoiador",
        formas_ajuda: Array.isArray(c.formas_ajuda) ? c.formas_ajuda : [],
        consentimento_whatsapp: c.consentimento_whatsapp,
        origem_detalhe: c.origem_detalhe ?? "",
        observacoes: c.observacoes ?? "",
      });
    }
  }, [q.data]);

  if (q.isLoading) return <div className="p-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;
  if (!q.data?.contact) return <div className="p-10">Contato não encontrado.</div>;

  const c = q.data.contact;
  const set = (k: string, v: unknown) => setForm((p) => ({ ...p, [k]: v }));
  const toggleAjuda = (v: string) => {
    const cur = (form.formas_ajuda as string[]) ?? [];
    set("formas_ajuda", cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
  };

  async function onCep(v: string) {
    const f = formatCep(v);
    set("cep", f);
    const d = f.replace(/\D/g, "");
    if (d.length === 8) {
      const r = await cepHook.lookup(d);
      if (r) {
        setForm((p) => ({
          ...p,
          endereco: r.endereco ?? p.endereco,
          bairro: r.bairro ?? p.bairro,
          cidade: r.cidade ?? p.cidade,
          uf: r.uf ?? p.uf,
        }));
      }
    }
  }

  async function save() {
    setSaving(true);
    try {
      await updateFn({ data: { id, ...form } as never });
      toast.success("Contato atualizado");
      q.refetch();
      hist.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const phonePreview = parsePhoneBR(String(form.phone_raw ?? ""));
  const tagIds = new Set((q.data.tags ?? []).map((t) => t!.id));
  const phoneDigits = (c.phone_e164 ?? "").replace(/\D/g, "");

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <button onClick={() => navigate({ to: "/contatos" })} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" />Voltar</button>
        <div className="flex gap-2">
          {phoneDigits && (
            <>
              <button onClick={() => { navigator.clipboard.writeText(c.phone_e164 ?? ""); toast.success("WhatsApp copiado"); }} className="text-xs inline-flex items-center gap-1 px-3 py-1.5 border rounded-md"><Copy className="h-3.5 w-3.5" /> Copiar</button>
              <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noreferrer" className="text-xs inline-flex items-center gap-1 px-3 py-1.5 border rounded-md text-emerald-600"><MessageCircle className="h-3.5 w-3.5" /> Abrir WhatsApp</a>
            </>
          )}
          <button onClick={async () => { await archiveFn({ data: { id, archived: !c.arquivado_at } }); q.refetch(); }} className="text-xs inline-flex items-center gap-1 px-3 py-1.5 border rounded-md">
            {c.arquivado_at ? <><ArchiveRestore className="h-3.5 w-3.5" /> Desarquivar</> : <><Archive className="h-3.5 w-3.5" /> Arquivar</>}
          </button>
        </div>
      </div>

      <div className="flex items-baseline gap-3 mb-1">
        <h1 className="text-2xl font-bold">{c.nome}</h1>
        {c.nome_social && <span className="text-muted-foreground">"{c.nome_social}"</span>}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge label={`Origem: ${c.origem}`} />
        {c.lifecycle_status && <Badge label={c.lifecycle_status} />}
        {c.phone_status && <Badge label={`Tel: ${c.phone_status}`} tone={c.phone_status === "valido" ? "ok" : "warn"} />}
        {c.whatsapp_status && <Badge label={`WA: ${c.whatsapp_status}`} />}
        {c.opt_out_at && <Badge label="Opt-out" tone="err" />}
        {c.arquivado_at && <Badge label="Arquivado" tone="warn" />}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        <div className="md:col-span-2 space-y-6">
          <Section title="Dados básicos">
            <Row><Field label="Nome completo *" value={form.nome} onChange={(v) => set("nome", v)} /></Row>
            <Row><Field label="Nome social / apelido" value={form.nome_social} onChange={(v) => set("nome_social", v)} /></Row>
            <Row><Field label="E-mail" value={form.email} onChange={(v) => set("email", v)} type="email" /></Row>
            <Row>
              <Field label="WhatsApp / telefone" value={form.phone_raw} onChange={(v) => set("phone_raw", v)} placeholder="(11) 91234-5678" />
              {form.phone_raw ? <p className="text-xs text-muted-foreground mt-1">→ {formatPhoneBR(phonePreview.phone_e164 ?? "") || "—"} ({phonePreview.phone_status})</p> : null}
            </Row>
          </Section>

          <Section title="Endereço">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1">
                <Field label={`CEP ${cepHook.loading ? "(buscando…)" : ""}`} value={form.cep} onChange={onCep} placeholder="00000-000" />
                {cepHook.error && <p className="text-xs text-amber-600 mt-1">{cepHook.error}</p>}
              </div>
              <Field label="UF" value={form.uf} onChange={(v) => set("uf", String(v).toUpperCase())} className="col-span-1" />
              <Field label="Cidade" value={form.cidade} onChange={(v) => set("cidade", v)} className="col-span-1" />
            </div>
            <Row><Field label="Endereço (rua/avenida)" value={form.endereco} onChange={(v) => set("endereco", v)} /></Row>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Número" value={form.numero} onChange={(v) => set("numero", v)} />
              <Field label="Complemento" value={form.complemento} onChange={(v) => set("complemento", v)} className="col-span-2" />
            </div>
            <Row><Field label="Bairro" value={form.bairro} onChange={(v) => set("bairro", v)} /></Row>
            <Row><Field label="Ponto de referência" value={form.referencia} onChange={(v) => set("referencia", v)} /></Row>
            {c.endereco_completo && <p className="text-xs text-muted-foreground mt-1">📍 {c.endereco_completo}</p>}
            <p className="text-xs text-muted-foreground">
              Geo: {c.geocoding_status ?? "—"}
              {c.latitude && c.longitude ? ` (${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)})` : ""}
            </p>
          </Section>

          <Section title="Perfil e organização">
            <Row><Field label="Profissão / ocupação" value={form.profissao} onChange={(v) => set("profissao", v)} /></Row>
            <Row>
              <label className="text-sm font-medium">Tipo de contato</label>
              <select value={String(form.tipo_contato ?? "")} onChange={(e) => set("tipo_contato", e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                {TIPO_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </Row>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.coletivo_alicerce} onChange={(e) => set("coletivo_alicerce", e.target.checked)} />
              Faz parte do Coletivo Alicerce
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.participa_movimento_social} onChange={(e) => set("participa_movimento_social", e.target.checked)} />
              Participa de movimento social
            </label>
            {!!form.participa_movimento_social && (
              <Row><Field label="Qual movimento social?" value={form.movimento_social_nome} onChange={(v) => set("movimento_social_nome", v)} /></Row>
            )}
            <div>
              <p className="text-sm font-medium mb-2">Formas de ajuda</p>
              <div className="grid grid-cols-2 gap-2">
                {FORMAS_AJUDA.map((f) => (
                  <label key={f.v} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={((form.formas_ajuda as string[]) ?? []).includes(f.v)} onChange={() => toggleAjuda(f.v)} />
                    {f.l}
                  </label>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Consentimento & status">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.consentimento_whatsapp} onChange={(e) => set("consentimento_whatsapp", e.target.checked)} />
              Consentimento para receber WhatsApp
            </label>
            {c.consentimento_at && <p className="text-xs text-muted-foreground">Desde {new Date(c.consentimento_at).toLocaleString("pt-BR")}</p>}
            <Row><Field label="Origem (detalhe)" value={form.origem_detalhe} onChange={(v) => set("origem_detalhe", v)} /></Row>
            <OptOutControl id={id} optOutAt={c.opt_out_at} motivo={c.opt_out_motivo} onChange={() => q.refetch()} fn={optOutFn} />
          </Section>

          <Section title="Observações internas">
            <textarea value={String(form.observacoes ?? "")} onChange={(e) => set("observacoes", e.target.value)} rows={5} maxLength={4000} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </Section>

          <div className="sticky bottom-4 flex justify-end">
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 shadow-lg">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar alterações
            </button>
          </div>
        </div>

        <aside className="space-y-6">
          <Section title={<span className="flex items-center gap-2"><TagIcon className="h-4 w-4" /> Tags</span>}>
            <TagPicker
              currentIds={tagIds}
              all={allTags.data?.tags ?? []}
              onToggle={async (tag_id, add) => { await setTagFn({ data: { contact_id: id, tag_id, add } }); q.refetch(); }}
              onCreate={async (nome) => { const t = await createTagFn({ data: { nome } }); await allTags.refetch(); await setTagFn({ data: { contact_id: id, tag_id: t.id, add: true } }); q.refetch(); }}
            />
          </Section>

          <Section title={<span className="flex items-center gap-2"><History className="h-4 w-4" /> Histórico</span>}>
            {hist.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
            {hist.data && (
              <div className="space-y-3 text-xs">
                <HistList title="Edições" items={hist.data.audit.map((a) => ({ key: a.id, when: a.created_at, text: a.action + (a.changes ? " · " + Object.keys(a.changes as object).join(", ") : "") }))} />
                <HistList title="Mensagens enviadas" items={hist.data.recipients.map((r) => ({ key: r.id, when: r.sent_at ?? r.failed_at ?? "", text: r.erro ? `erro: ${r.erro}` : r.delivered_at ? "entregue" : r.sent_at ? "enviado" : "pendente" }))} />
                <HistList title="Eventos WhatsApp" items={hist.data.events.map((e) => ({ key: e.id, when: e.received_at, text: e.tipo }))} />
                <HistList title="Respostas recebidas" items={hist.data.inbound.map((i) => ({ key: i.id, when: i.received_at, text: i.conteudo ?? `(${i.tipo ?? "mídia"})` }))} />
              </div>
            )}
          </Section>

          <TerritorioLogsSection contactId={id} />
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card border rounded-xl p-5 space-y-3">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
function Row({ children }: { children: React.ReactNode }) { return <div>{children}</div>; }

function Field({ label, value, onChange, className, ...rest }: { label: string; value: unknown; onChange: (v: string) => void; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <div className={className}>
      <label className="text-sm font-medium">{label}</label>
      <input {...rest} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
    </div>
  );
}

function Badge({ label, tone = "default" }: { label: string; tone?: "default" | "ok" | "warn" | "err" }) {
  const cls = tone === "ok" ? "bg-emerald-100 text-emerald-700" : tone === "warn" ? "bg-amber-100 text-amber-700" : tone === "err" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground";
  return <span className={`px-2 py-0.5 rounded ${cls}`}>{label}</span>;
}

function OptOutControl({ id, optOutAt, motivo, onChange, fn }: { id: string; optOutAt: string | null; motivo: string | null; onChange: () => void; fn: ReturnType<typeof useServerFn<typeof setOptOut>> }) {
  const [showMotivo, setShowMotivo] = useState(false);
  const [m, setM] = useState(motivo ?? "");
  if (optOutAt) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
        <p className="font-medium text-red-700">Marcado como não enviar</p>
        {motivo && <p className="text-xs mt-1">Motivo: {motivo}</p>}
        <button onClick={async () => { await fn({ data: { id, optOut: false } }); onChange(); }} className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700"><UserCheck className="h-3.5 w-3.5" /> Reativar contato</button>
      </div>
    );
  }
  return showMotivo ? (
    <div className="space-y-2">
      <input value={m} onChange={(e) => setM(e.target.value)} placeholder="Motivo (opcional)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      <button onClick={async () => { await fn({ data: { id, optOut: true, motivo: m || undefined } }); onChange(); setShowMotivo(false); }} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-600 text-white text-xs"><UserMinus className="h-3.5 w-3.5" /> Confirmar opt-out</button>
    </div>
  ) : (
    <button onClick={() => setShowMotivo(true)} className="text-xs text-muted-foreground hover:text-red-600 inline-flex items-center gap-1"><UserMinus className="h-3.5 w-3.5" /> Marcar como não enviar</button>
  );
}

function TagPicker({ currentIds, all, onToggle, onCreate }: {
  currentIds: Set<string>;
  all: Array<{ id: string; nome: string; cor: string | null; categoria: string }>;
  onToggle: (id: string, add: boolean) => Promise<void>;
  onCreate: (nome: string) => Promise<void>;
}) {
  const [newTag, setNewTag] = useState("");
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {all.map((t) => {
          const on = currentIds.has(t.id);
          return (
            <button key={t.id} onClick={() => onToggle(t.id, !on)} className={`text-xs px-2 py-0.5 rounded border ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-accent"}`}>
              {on && <X className="inline h-3 w-3 mr-0.5" />}{t.nome}
            </button>
          );
        })}
        {all.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma tag ainda.</p>}
      </div>
      <div className="flex gap-1">
        <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Nova tag" className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs" />
        <button onClick={async () => { if (newTag.trim()) { await onCreate(newTag.trim()); setNewTag(""); } }} className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs"><Plus className="h-3 w-3" /></button>
      </div>
    </div>
  );
}

function HistList({ title, items }: { title: string; items: Array<{ key: string; when: string; text: string }> }) {
  return (
    <div>
      <p className="font-medium text-muted-foreground mb-1">{title}</p>
      {items.length === 0 ? <p className="text-muted-foreground/60">—</p> : (
        <ul className="space-y-1">
          {items.slice(0, 5).map((i) => (
            <li key={i.key} className="border-l-2 border-muted pl-2">
              <span className="text-muted-foreground">{i.when ? new Date(i.when).toLocaleString("pt-BR") : "—"}</span> · {i.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TerritorioLogsSection({ contactId }: { contactId: string }) {
  const listFn = useServerFn(listContactTerritoryLogs);
  const q = useQuery({ queryKey: ["territory-logs", contactId], queryFn: () => listFn({ data: { contactId } }) });
  return (
    <Section title={<span className="flex items-center gap-2"><History className="h-4 w-4" /> Território</span>}>
      {q.isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}
      {q.data && q.data.rows.length === 0 && (
        <p className="text-xs text-muted-foreground">Sem registros territoriais.</p>
      )}
      {q.data && q.data.rows.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {q.data.rows.map((r: { id: string; action: string; note: string | null; created_at: string }) => (
            <li key={r.id} className="border-l-2 border-muted pl-2">
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</span>
              {" · "}<span className="font-medium">{r.action}</span>
              {r.note && <span className="text-muted-foreground"> · {r.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

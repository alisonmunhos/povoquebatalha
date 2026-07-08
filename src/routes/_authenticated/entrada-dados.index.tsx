import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listFormDefinitions, createFormDefinition } from "@/lib/form-definitions.functions";
import { FIXED_FORM_PUBLIC_PATHS } from "@/lib/form-field-catalog";
import { generateQrDataUrl } from "@/lib/qr-code-browser";
import { Plus, ClipboardList, ExternalLink, Link2, Copy, MessageCircle, QrCode, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/entrada-dados/")({
  head: () => ({ meta: [{ title: "Entrada de Dados" }] }),
  component: EntradaDadosLista,
});

const ACCENT_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(ACCENT_MARKS, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function EntradaDadosLista() {
  const navigate = useNavigate();
  const listFn = useServerFn(listFormDefinitions);
  const createFn = useServerFn(createFormDefinition);
  const q = useQuery({ queryKey: ["form-definitions"], queryFn: () => listFn() });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceFormType, setSourceFormType] = useState<"cadastro_completo" | "receber_informacoes">("cadastro_completo");
  const [saving, setSaving] = useState(false);

  async function onCreate() {
    if (title.trim().length < 2) { toast.error("Dê um título ao formulário."); return; }
    setSaving(true);
    try {
      const row = await createFn({ data: { title: title.trim(), slug: slugify(title), source_form_type: sourceFormType } });
      toast.success("Formulário criado");
      setOpen(false);
      setTitle("");
      navigate({ to: "/entrada-dados/$id", params: { id: row.id as string } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar formulário");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="h-6 w-6" /> Entrada de Dados</h1>
        <p className="text-sm text-muted-foreground mt-1">Monte formulários públicos personalizados e gere link + QR code.</p>
      </div>

      <Tabs defaultValue="formularios">
        <TabsList>
          <TabsTrigger value="formularios">Formulários</TabsTrigger>
          <TabsTrigger value="link-avulso">Link avulso</TabsTrigger>
        </TabsList>

        <TabsContent value="formularios">
          <div className="flex items-center justify-end mb-4">
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">
              <Plus className="h-4 w-4" /> Novo formulário
            </button>
          </div>

          {open && (
            <div className="mb-6 border rounded-xl bg-card p-4 space-y-3">
              <div>
                <label className="text-sm font-medium">Título do formulário</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Mutirão Zona Leste" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
                {title && <p className="text-xs text-muted-foreground mt-1">Link: /f/{slugify(title)}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Tipo de formulário</label>
                <select value={sourceFormType} onChange={(e) => setSourceFormType(e.target.value as typeof sourceFormType)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="cadastro_completo">Cadastro completo</option>
                  <option value="receber_informacoes">Receber informações</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={onCreate} disabled={saving} className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {saving ? "Criando…" : "Criar e continuar"}
                </button>
                <button onClick={() => setOpen(false)} className="rounded-md border px-4 py-2 text-sm">Cancelar</button>
              </div>
            </div>
          )}

          <div className="border rounded-xl bg-card divide-y">
            {(q.data ?? []).length === 0 && <p className="p-6 text-sm text-muted-foreground">Nenhum formulário criado ainda.</p>}
            {(q.data ?? []).map((f) => {
              const isFixed = Boolean(f.is_fixed);
              const publicPath = isFixed ? (FIXED_FORM_PUBLIC_PATHS[f.slug as string] ?? `/${f.slug}`) : `/f/${f.slug}`;
              return (
                <Link key={f.id as string} to="/entrada-dados/$id" params={{ id: f.id as string }} className="flex items-center justify-between p-4 hover:bg-muted/40">
                  <div>
                    <p className="font-medium">{f.title as string}</p>
                    <p className="text-xs text-muted-foreground">{publicPath}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {isFixed && <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Fixo</span>}
                    <span className={`px-2 py-0.5 rounded-full ${f.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                      {f.is_active ? "Ativo" : "Inativo"}
                    </span>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </Link>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="link-avulso">
          <LinkAvulsoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LinkAvulsoTab() {
  const [phone, setPhone] = useState("+5551981951545");
  const [message, setMessage] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const digits = phone.replace(/\D+/g, "");
  const waUrl = digits ? `https://wa.me/${digits}${message.trim() ? `?text=${encodeURIComponent(message)}` : ""}` : null;

  async function loadQrCode() {
    if (!waUrl) return;
    setLoadingQr(true);
    try {
      const dataUrl = await generateQrDataUrl(waUrl);
      setQrDataUrl(dataUrl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar QR code");
    } finally {
      setLoadingQr(false);
    }
  }

  return (
    <div className="border rounded-xl bg-card p-4 space-y-4">
      <div>
        <h2 className="font-semibold flex items-center gap-2"><Link2 className="h-4 w-4" /> Gerador de link avulso</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Gera um link "wa.me" pronto (com mensagem já preenchida) e o QR code dele, sem precisar de nenhum formulário.
        </p>
      </div>
      <div>
        <label className="text-sm font-medium">Número</label>
        <input value={phone} onChange={(e) => { setPhone(e.target.value); setQrDataUrl(null); }} placeholder="+5551981951545" className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <div>
        <label className="text-sm font-medium">Mensagem</label>
        <textarea value={message} onChange={(e) => { setMessage(e.target.value); setQrDataUrl(null); }} rows={3} placeholder="Ex.: Olá! Quero saber mais sobre a campanha." className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>

      {waUrl ? (
        <div className="space-y-3">
          <input readOnly value={waUrl} className="w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-xs font-mono" />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(waUrl); toast.success("Link copiado"); }}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted"
            >
              <Copy className="h-3.5 w-3.5" /> Copiar
            </button>
            <a href={waUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted">
              <MessageCircle className="h-3.5 w-3.5" /> Abrir no WhatsApp
            </a>
            <button onClick={loadQrCode} disabled={loadingQr} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50">
              {loadingQr ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              {loadingQr ? "Gerando…" : "Gerar QR code"}
            </button>
          </div>
          {qrDataUrl && (
            <div className="space-y-2">
              <img src={qrDataUrl} alt="QR code do link" className="w-40 h-40 border rounded-md" />
              <a href={qrDataUrl} download="qrcode-link-avulso.png" className="text-sm text-primary hover:underline block">Baixar PNG</a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Digite um número para gerar o link.</p>
      )}
    </div>
  );
}

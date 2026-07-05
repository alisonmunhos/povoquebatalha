import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listFormDefinitions, createFormDefinition } from "@/lib/form-definitions.functions";
import { Plus, ClipboardList, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/entrada-dados")({
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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="h-6 w-6" /> Entrada de Dados</h1>
          <p className="text-sm text-muted-foreground mt-1">Monte formulários públicos personalizados e gere link + QR code.</p>
        </div>
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
        {(q.data ?? []).map((f) => (
          <Link key={f.id as string} to="/entrada-dados/$id" params={{ id: f.id as string }} className="flex items-center justify-between p-4 hover:bg-muted/40">
            <div>
              <p className="font-medium">{f.title as string}</p>
              <p className="text-xs text-muted-foreground">/f/{f.slug as string}</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded-full ${f.is_active ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
                {f.is_active ? "Ativo" : "Inativo"}
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

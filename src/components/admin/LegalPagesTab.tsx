import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { deleteLegalPage, getLegalPage, listLegalPages, upsertLegalPage } from "@/lib/legal-pages.functions";
import { Copy, ExternalLink, FileText, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const ACCENT_MARKS = /[\u0300-\u036f]/g;

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(ACCENT_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type LegalPageListItem = {
  id: string;
  slug: string;
  title: string;
  updated_at: string;
};

export function LegalPagesTab() {
  const listFn = useServerFn(listLegalPages);
  const getFn = useServerFn(getLegalPage);
  const upsertFn = useServerFn(upsertLegalPage);
  const deleteFn = useServerFn(deleteLegalPage);
  const q = useQuery({ queryKey: ["legal-pages"], queryFn: () => listFn() });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setSlug("");
    setContent("");
    setSlugTouched(false);
    setPdfUrl(null);
  }

  async function startCreate() {
    resetForm();
    setEditingId("new");
  }

  async function startEdit(id: string) {
    setLoadingEdit(true);
    try {
      const row = await getFn({ data: { id } });
      setEditingId(id);
      setTitle(row.title);
      setSlug(row.slug);
      setContent(row.content);
      setPdfUrl((row as { pdf_url?: string | null }).pdf_url ?? null);
      setSlugTouched(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar página");
    } finally {
      setLoadingEdit(false);
    }
  }

  async function onUploadPdf(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast.error("Envie apenas arquivos PDF.");
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("O PDF deve ter no máximo 15 MB.");
      return;
    }
    const folder = slugify(slug || title) || "sem-slug";
    const base = slugify(file.name.replace(/\.pdf$/i, "")) || "documento";
    const path = `${folder}/${Date.now()}-${base}.pdf`;
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("public-docs")
        .upload(path, file, { contentType: "application/pdf", upsert: false });
      if (error) throw error;
      setPdfUrl(`/api/public/docs/${path}`);
      toast.success("PDF anexado. Clique em Salvar para publicar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar PDF");
    } finally {
      setUploading(false);
    }
  }

  async function onSave() {
    if (title.trim().length < 2) {
      toast.error("Informe um título.");
      return;
    }
    const finalSlug = slugify(slug || title);
    if (finalSlug.length < 2) {
      toast.error("Slug inválido.");
      return;
    }
    if (!pdfUrl && content.trim().length === 0) {
      toast.error("Informe o conteúdo ou anexe um PDF.");
      return;
    }
    setSaving(true);
    try {
      await upsertFn({
        data: {
          id: editingId && editingId !== "new" ? editingId : undefined,
          title: title.trim(),
          slug: finalSlug,
          content,
          pdf_url: pdfUrl,
        },
      });
      toast.success(editingId === "new" ? "Página criada" : "Página salva");
      resetForm();
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string, pageTitle: string) {
    if (!confirm(`Excluir a página "${pageTitle}"? Links que apontam para ela deixarão de funcionar.`)) return;
    setDeletingId(id);
    try {
      await deleteFn({ data: { id } });
      toast.success("Página excluída");
      if (editingId === id) resetForm();
      q.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeletingId(null);
    }
  }

  const publicPath = (s: string) => `/termos/${s}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Crie páginas públicas reutilizáveis. Use o caminho <code className="text-foreground">/termos/seu-slug</code> no campo URL de links de perguntas.
        </p>
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 shrink-0"
        >
          <Plus className="h-4 w-4" /> Nova página
        </button>
      </div>

      {editingId && (
        <div className="border rounded-xl bg-card p-4 space-y-3">
          <h2 className="font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4" />
            {editingId === "new" ? "Nova página" : "Editar página"}
          </h2>
          <div>
            <label className="text-sm font-medium">Título</label>
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Slug (URL)</label>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-sm text-muted-foreground shrink-0">/termos/</span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Anexar PDF</label>
            {pdfUrl ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <FileText className="h-4 w-4 shrink-0" />
                <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:underline">
                  {decodeURIComponent(pdfUrl.split("/").pop() ?? "arquivo.pdf")}
                </a>
                <button
                  type="button"
                  onClick={() => setPdfUrl(null)}
                  className="text-xs px-3 py-1.5 rounded-md border text-destructive hover:bg-destructive/10"
                >
                  Remover PDF
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onUploadPdf(f);
                }}
                className="mt-1 block w-full text-sm"
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {uploading ? "Enviando PDF…" : "Somente PDF, até 15 MB. Com PDF anexado, o texto abaixo é opcional."}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium">Conteúdo (texto puro){pdfUrl ? " — opcional" : ""}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={12}
              placeholder="Cole ou digite o texto. Quebras de linha são preservadas."
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={resetForm} className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">Nenhuma página cadastrada ainda.</p>
      ) : (
        <ul className="space-y-2">
          {(q.data as LegalPageListItem[]).map((page) => (
            <li key={page.id} className="border rounded-lg bg-card p-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{page.title}</p>
                <p className="text-xs text-muted-foreground font-mono">{publicPath(page.slug)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(publicPath(page.slug));
                    toast.success("Caminho copiado");
                  }}
                  className="p-2 hover:bg-muted rounded"
                  title="Copiar caminho"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <a
                  href={publicPath(page.slug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 hover:bg-muted rounded"
                  title="Abrir página"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => startEdit(page.id)}
                  disabled={loadingEdit}
                  className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(page.id, page.title)}
                  disabled={deletingId === page.id}
                  className="p-2 hover:bg-destructive/10 text-destructive rounded"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
